const http = require('http');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Create uploads folder if not exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

http.createServer((req, res) => {
    if (req.url === '/fileupload' && req.method.toLowerCase() === 'post') {
        const form = new formidable.IncomingForm({
            uploadDir: uploadDir,
            keepExtensions: true,
            multiples: true, // Allow multiple files
            maxFileSize: 10 * 1024 * 1024 // 10MB per file
        });

        form.parse(req, async (err, fields, files) => {
            if (err) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                return res.end('File upload error: ' + err.message);
            }

            const uploadedFiles = Array.isArray(files.filetoupload) ? files.filetoupload : [files.filetoupload];

            // Validation: maximum 3 files
            if (uploadedFiles.length > 3) {
                return res.end('Error: Maximum 3 files allowed.');
            }

            let results = [];

            for (const file of uploadedFiles) {
                // Validation: only PDFs
                if (!file || !file.mimetype || !file.mimetype.includes('pdf')) {
                    return res.end('Error: Only PDF files are allowed.');
                }
                
                const oldPath = file.filepath;
                const newPath = path.join(uploadDir, file.originalFilename);

                // Rename and move the uploaded file
                fs.renameSync(oldPath, newPath);

                try {
                    const dataBuffer = fs.readFileSync(newPath);
                    const pdfData = await pdfParse(dataBuffer);

                    // Create Word file (simple .docx)
                    const wordFilename = file.originalFilename.replace('.pdf', '.docx');
                    const wordPath = path.join(uploadDir, wordFilename);
                    fs.writeFileSync(wordPath, pdfData.text);

                    results.push({
                        originalFile: file.originalFilename,
                        savedPdf: newPath,
                        generatedWord: wordPath
                    });

                } catch (error) {
                    console.error('PDF parsing error:', error);
                    return res.end('Error processing PDF.');
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Files uploaded and converted successfully!',
                files: results
            }));
        });
    } else {
        // Serve Upload Form
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<h2>Upload PDF files (max 3 files, 10MB each)</h2>');
        res.write('<form action="/fileupload" method="post" enctype="multipart/form-data">');
        res.write('<input type="file" name="filetoupload" multiple><br><br>');
        res.write('<input type="submit" value="Upload Files">');
        res.write('</form>');
        return res.end();
    }
}).listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
