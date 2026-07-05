const revealItems = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.18 });
revealItems.forEach((item) => observer.observe(item));
const slides = Array.from(document.querySelectorAll('.gallery__slide'));
const buttons = document.querySelectorAll('.slider-button');
let current = 0;
function showSlide(index) { slides.forEach((slide, i) => slide.classList.toggle('active', i === index)); }
function nextSlide() { current = (current + 1) % slides.length; showSlide(current); }
function prevSlide() { current = (current - 1 + slides.length) % slides.length; showSlide(current); }
buttons.forEach((button) => button.addEventListener('click', () => (button.dataset.dir === 'next' ? nextSlide() : prevSlide())));
setInterval(nextSlide, 5000);
showSlide(0);
