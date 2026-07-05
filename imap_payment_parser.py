#!/usr/bin/env python3
"""Read incoming Gmail IMAP messages and extract payment details.

Configure your Gmail username and app password below.
Enable IMAP in the Gmail settings and use an app password if 2FA is enabled.
"""

import os
import imaplib
import email
import re
import signal
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime

stop_requested = False

def request_stop(signum, frame):
    global stop_requested
    stop_requested = True
    print("Stop requested, exiting...")

# Configuration
IMAP_HOST = "imap.gmail.com"
IMAP_PORT = 993
USERNAME = os.getenv("GMAIL_USER", "alexamart@gmail.com")
PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "rqpuadeqpjyrtcqv")
MAX_EMAIL_AGE_MINUTES = int(os.getenv("MAX_EMAIL_AGE_MINUTES", "20"))
MAX_MESSAGES = int(os.getenv("MAX_MESSAGES", "20"))
IMAP_IDLE_TIMEOUT = int(os.getenv("IMAP_IDLE_TIMEOUT", "1740"))

# Sender whitelist: only process emails from known payment senders.
ALLOWED_SENDERS = [
    "sandrawan066@gmail.com"]

# Subject patterns to validate payment emails.
ALLOWED_SUBJECT_PATTERNS = [
    r"YAPE",
    r"receipt",
]

# Search criteria: UNSEEN only or ALL if you want to re-process messages.
SEARCH_CRITERIA = "UNSEEN"


def decode_header_value(value):
    if not value:
        return ""

    decoded_parts = decode_header(value)
    text_parts = []

    for part, encoding in decoded_parts:
        if isinstance(part, bytes):
            text_parts.append(part.decode(encoding or "utf-8", errors="ignore"))
        else:
            text_parts.append(part)

    return "".join(text_parts)


def normalize_sender(sender):
    if not sender:
        return ""
    return sender.lower().strip()


def validate_sender(sender):
    normalized = normalize_sender(sender)
    return any(allowed in normalized for allowed in ALLOWED_SENDERS)


def validate_subject(subject):
    normalized = subject.lower()
    return any(re.search(pattern, normalized) for pattern in ALLOWED_SUBJECT_PATTERNS)


def build_search_criteria():
    criteria = [SEARCH_CRITERIA]

    if ALLOWED_SENDERS:
        quoted_senders = [f'"{sender}"' for sender in ALLOWED_SENDERS]
        if len(quoted_senders) == 1:
            criteria.extend(["FROM", quoted_senders[0]])
        else:
            from_clause = ["FROM", quoted_senders[-1]]
            for sender in reversed(quoted_senders[:-1]):
                from_clause = ["OR", "FROM", sender] + from_clause
            criteria.extend(from_clause)

    try:
        now = datetime.now(timezone.utc)
        since_date = (now - timedelta(minutes=MAX_EMAIL_AGE_MINUTES)).date()
        criteria.extend(["SINCE", since_date.strftime("%d-%b-%Y")])
    except Exception:
        pass

    return criteria


def strip_html(html_text):
    text = re.sub(r"<style.*?>.*?</style>", "", html_text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script.*?>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def get_message_text(message):
    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            if content_type == "text/plain" and "attachment" not in content_disposition:
                return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="ignore")
            if content_type == "text/html" and "attachment" not in content_disposition:
                html = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="ignore")
                return strip_html(html)
        return ""

    content_type = message.get_content_type()
    payload = message.get_payload(decode=True)
    if payload is None:
        return ""
    if content_type == "text/html":
        return strip_html(payload.decode(message.get_content_charset() or "utf-8", errors="ignore"))
    return payload.decode(message.get_content_charset() or "utf-8", errors="ignore")


def parse_amount(text):
    patterns = [
        r"(?:amount|total|paid)\s*[:\-]?\s*\$?([0-9]+(?:\.[0-9]{2})?)",
        r"\$([0-9]+(?:\.[0-9]{2})?)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def parse_payer(text):
    patterns = [
        r"payer\s*[:\-]?\s*(.+?)(?:\n|\r|\.|,|$)",
        r"from\s*[:\-]?\s*(.+?)(?:\n|\r|\.|,|$)",
        r"pago de\s*(.+?)(?:\n|\r|\.|,|$)",
        r"customer\s*[:\-]?\s*(.+?)(?:\n|\r|\.|,|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def parse_datetime(message, body_text):
    date_header = message.get("Date")
    if date_header:
        try:
            return parsedate_to_datetime(date_header)
        except Exception:
            pass

    patterns = [
        r"(\d{1,2}/\d{1,2}/\d{2,4})\s*(?:at\s*)?(\d{1,2}:\d{2}(?:\s*[APMapm]{2})?)",
        r"(\d{4}-\d{2}-\d{2})\s*(\d{1,2}:\d{2}(?::\d{2})?)",
    ]
    for pattern in patterns:
        match = re.search(pattern, body_text)
        if match:
            combined = " ".join(match.groups())
            for fmt in ["%m/%d/%Y %I:%M %p", "%m/%d/%y %I:%M %p", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"]:
                try:
                    return datetime.strptime(combined, fmt)
                except ValueError:
                    continue
    return None


def parse_payment_info(message):
    sender = decode_header_value(message.get("From"))
    subject = decode_header_value(message.get("Subject"))
    body = get_message_text(message)

    valid_sender = validate_sender(sender)
    valid_subject = validate_subject(subject)
    if not valid_sender and not valid_subject:
        return None

    amount = parse_amount(body)
    payer = parse_payer(body)
    when = parse_datetime(message, body)

    return {
        "sender": sender,
        "subject": subject,
        "payer": payer,
        "amount": amount,
        "datetime": when.isoformat() if when else None,
        "body_preview": body[:300].strip(),
    }


def is_recent_message(message, max_age_minutes=MAX_EMAIL_AGE_MINUTES):
    date_header = message.get("Date")
    if not date_header:
        return False

    try:
        msg_dt = parsedate_to_datetime(date_header)
        if msg_dt is None:
            return False

        if msg_dt.tzinfo is None:
            msg_dt = msg_dt.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        age_seconds = (now - msg_dt.astimezone(timezone.utc)).total_seconds()
        return age_seconds <= max_age_minutes * 60
    except Exception:
        return False


def search_inbox(mail):
    status, data = mail.select("INBOX")
    if status != "OK":
        raise RuntimeError("Unable to open INBOX")

    criteria = build_search_criteria()
    print(f"Search criteria: {criteria}")
    status, data = mail.search(None, *criteria)
    if status != "OK":
        raise RuntimeError("Search failed: %s" % data)

    msg_ids = data[0].split() if data and data[0] else []
    print(f"search_inbox returned {len(msg_ids)} message(s)")
    return msg_ids


def get_allowed_sender_ids(mail, msg_ids):
    allowed_ids = []
    for msg_id in reversed(msg_ids):
        if len(allowed_ids) >= MAX_MESSAGES:
            break

        status, msg_data = mail.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (FROM DATE)])")
        if status != "OK" or not msg_data or not msg_data[0]:
            continue

        raw_header = msg_data[0][1]
        if not raw_header:
            continue

        header_msg = email.message_from_bytes(raw_header)
        sender = decode_header_value(header_msg.get("From"))
        if not validate_sender(sender):
            continue

        if not is_recent_message(header_msg):
            continue

        allowed_ids.append(msg_id)

    return list(reversed(allowed_ids))


def process_message_id(mail, msg_id):
    status, msg_data = mail.fetch(msg_id, "(RFC822)")
    if status != "OK" or not msg_data or not msg_data[0]:
        print(f"Failed to fetch message {msg_id.decode()}")
        return

    raw_email = msg_data[0][1]
    if not raw_email:
        print(f"Empty message payload for {msg_id.decode()}")
        return

    message = email.message_from_bytes(raw_email)
    subject = decode_header_value(message.get("Subject"))
    subject_preview = " ".join(subject.split()[:6]) if subject else "(no subject)"

    if not is_recent_message(message):
        print(f"Skipped message {msg_id.decode()} (older than {MAX_EMAIL_AGE_MINUTES} minutes, subject: {subject_preview})")
        return

    payment_info = parse_payment_info(message)
    if payment_info is None:
        print(f"Skipped message {msg_id.decode()} (sender/subject did not match, subject: {subject_preview})")
        return

    print("---")
    print(f"Message ID: {msg_id.decode()}")
    print(f"Sender: {payment_info['sender']}")
    print(f"Subject: {payment_info['subject']}")
    print(f"Payer: {payment_info['payer']}")
    print(f"Amount: {payment_info['amount']}")
    print(f"Date/Time: {payment_info['datetime']}")

    # Uncomment to mark the message as seen after processing.
    # mail.store(msg_id, "+FLAGS", "\\Seen")


def search_and_process_new_messages(mail):
    msg_ids = search_inbox(mail)
    if not msg_ids:
        return

    allowed_ids = get_allowed_sender_ids(mail, msg_ids)
    print(f"Allowed sender IDs: {allowed_ids}")
    if not allowed_ids:
        return

    print(f"Processing {len(allowed_ids)} new allowed sender message(s)...")
    for msg_id in allowed_ids:
        process_message_id(mail, msg_id)


def watch_inbox(mail, timeout=IMAP_IDLE_TIMEOUT):
    print("Listening for new incoming mail with IMAP IDLE...")
    while not stop_requested:
        try:
            with mail.idle(duration=timeout) as idler:
                for typ, data in idler:
                    if stop_requested:
                        break
                    print(f"IDLE event: typ={typ}, data={data}")
                    if typ == 'OK':
                        continue

                    trigger = False
                    if typ in ('EXISTS', 'RECENT'):
                        trigger = True
                    elif isinstance(data, list):
                        trigger = any(isinstance(item, bytes) and b'EXISTS' in item for item in data)

                    if trigger:
                        print("New mail event detected, leaving IDLE and checking inbox...")
                        break

            if stop_requested:
                break

            # leave IDLE before issuing any new commands
            search_and_process_new_messages(mail)

        except KeyboardInterrupt:
            break
        except Exception as exc:
            print("IMAP IDLE error:", exc)
            print("Reconnecting to IDLE in 10 seconds...")
            import time
            time.sleep(10)

    print("Stopped watching inbox.")


def main():
    print("Connecting to Gmail IMAP...")
    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    try:
        with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as mail:
            mail.login(USERNAME, PASSWORD)
            print("Connected and logged in successfully.")
            print("IMAP capabilities:", mail.capabilities)
            search_and_process_new_messages(mail)
            watch_inbox(mail)
    except imaplib.IMAP4.error as exc:
        print("IMAP login failed for:", USERNAME)
        print("Error:", exc)
        print("Make sure you are using a Gmail app password and IMAP is enabled.")
        print("Set environment variables GMAIL_USER and GMAIL_APP_PASSWORD.")
    except KeyboardInterrupt:
        print("Interrupted by user, exiting.")


if __name__ == "__main__":
    main()
