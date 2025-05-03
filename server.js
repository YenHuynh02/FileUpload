require('dotenv').config();
const http = require('http');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { BlobServiceClient } = require('@azure/storage-blob');

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME;

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

// Create uploads folder if not exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Create server
http.createServer((req, res) => {
    if (req.url === '/fileupload' && req.method.toLowerCase() === 'post') {
        const form = new formidable.IncomingForm({
            uploadDir: uploadDir,
            keepExtensions: true,
            multiples: true,
            maxFileSize: 10 * 1024 * 1024
        });

        form.parse(req, async (err, fields, files) => {
            if (err) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                return res.end('File upload error: ' + err.message);
            }

            const uploadedFiles = Array.isArray(files.filetoupload) ? files.filetoupload : [files.filetoupload];
            if (uploadedFiles.length > 3) {
                return res.end('Error: Maximum 3 files allowed.');
            }

            let results = [];

            for (const file of uploadedFiles) {
                if (!file || !file.mimetype || !file.mimetype.includes('pdf')) {
                    return res.end('Error: Only PDF files are allowed.');
                }

                try {
                    const dataBuffer = fs.readFileSync(file.filepath);
                    const pdfData = await pdfParse(dataBuffer);

                    const pdfBlobName = file.originalFilename;
                    const wordBlobName = pdfBlobName.replace('.pdf', '.docx');

                    const fileExtension = path.extname(pdfBlobName).replace('.', '');
                    const fileBaseName = path.basename(pdfBlobName, '.' + fileExtension);
                    const uploadTime = new Date().toISOString();

                    // Upload PDF with metadata
                    const pdfBlockBlob = containerClient.getBlockBlobClient(pdfBlobName);
                    await pdfBlockBlob.uploadData(dataBuffer, {
                        blobHTTPHeaders: { blobContentType: 'application/pdf' },
                        metadata: {
                            filename: fileBaseName,
                            extension: fileExtension,
                            uploaded: uploadTime
                        }
                    });

                    // Upload Word (.docx) version with metadata
                    const wordBlockBlob = containerClient.getBlockBlobClient(wordBlobName);
                    await wordBlockBlob.uploadData(Buffer.from(pdfData.text), {
                        blobHTTPHeaders: {
                            blobContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        },
                        metadata: {
                            filename: path.basename(wordBlobName, '.docx'),
                            extension: 'docx',
                            uploaded: uploadTime
                        }
                    });

                    results.push({
                        originalFile: pdfBlobName,
                        azurePdfUrl: pdfBlockBlob.url,
                        azureWordUrl: wordBlockBlob.url
                    });

                } catch (error) {
                    console.error('PDF parsing or upload error:', error);
                    return res.end('Error processing PDF.');
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Files uploaded to Azure and converted successfully!',
                files: results
            }));
        });

    } else {
        // Serve the upload form
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
