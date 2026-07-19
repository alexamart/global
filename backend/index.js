const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');

const { PORT = 4000 } = process.env;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
