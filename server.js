const express = require('express');
const path = require('path');
const app = express();

// Serve all static files from the same folder
app.use(express.static(path.join(__dirname)));

// Fallback — always serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`G&T Solutions website running on port ${PORT}`);
});
