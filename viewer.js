// Replace with your OneDrive direct download PDF link
const pdfUrl = "https://onedrive.live.com/download?resid=YOUR_FILE_ID";

let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = 1.2,
    canvas = document.getElementById('pdf-render'),
    ctx = canvas.getContext('2d');

// Load the PDF
pdfjsLib.getDocument(pdfUrl).promise.then(function (pdfDoc_) {
    pdfDoc = pdfDoc_;
    document.getElementById('page_count').textContent = pdfDoc.numPages;
    renderPage(pageNum);
});

function renderPage(num) {
    pageRendering = true;
    pdfDoc.getPage(num).then(function (page) {
        let viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        let renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        let renderTask = page.render(renderContext);

        renderTask.promise.then(function () {
            pageRendering = false;
            document.getElementById('page_num').textContent = num;

            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    });
}

function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

document.getElementById('prev').addEventListener('click', function () {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
});

document.getElementById('next').addEventListener('click', function () {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
});

document.getElementById('zoomIn').addEventListener('click', function () {
    scale += 0.2;
    renderPage(pageNum);
});

document.getElementById('zoomOut').addEventListener('click', function () {
    if (scale <= 0.4) return;
    scale -= 0.2;
    renderPage(pageNum);
});

// Search feature (simple text search)
document.getElementById('searchBtn').addEventListener('click', function () {
    alert("PDF.js text search requires extra parsing — basic search disabled for security.");
});
