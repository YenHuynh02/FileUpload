const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
// const open = require('open');
const app = express();

app.get('/', (req, res) => {
    res.send("Hello world!")
});

app.listen(3000, () => {
    console.log('Server started on http://localhost:3000');
    // open('http://localhost:3000');
});