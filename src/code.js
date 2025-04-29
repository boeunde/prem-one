figma.showUI(__html__);

figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  if (selection.length >= 1 && selection.every(node => node.type === "FRAME")) {
    figma.ui.postMessage({ type: "enable-export", enabled: true });
  } else {
    figma.ui.postMessage({ type: "enable-export", enabled: false });
  }
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === "export") {
    const selection = figma.currentPage.selection;
    const files = {};
    const linkArrayForScript = [];

    for (const frame of selection) {
      const exportOptions = {
        format: "PNG",
        constraint: { type: "SCALE", value: 2 }
      };
      const pngBytes = await frame.exportAsync(exportOptions);

      const frameName = sanitizeFilename(frame.name || "exported");

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${frameName}</title>
          <style>
            body {
              margin: 0;
              background-color: #ffffff;
              height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            img {
              width: 50%;
              height: auto;
            }
          </style>
        </head>
        <body>
          <img src="../Thumbnails/${frameName}.png" alt="${frameName}">
        </body>
        </html>
      `;

      files[`Thumbnails/${frameName}.png`] = pngBytes;
      files[`Frames/${frameName}.html`] = htmlContent;

      linkArrayForScript.push({ name: frameName, url: `Frames/${frameName}.html` });
    }

    const indexHtmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Exported Frames</title>
        <style>
          body {
            margin: 0;
            height: 100vh;
            display: flex;
            overflow: hidden;
            font-family: sans-serif;
          }
          #sidebar {
            width: 200px;
            background: #f2f2f2;
            padding: 20px;
            box-sizing: border-box;
            overflow-y: auto;
          }
          #viewer {
            flex: 1;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          iframe {
            width: 100%;
            height: 100%;
            border: none;
          }
          a {
            display: block;
            margin-bottom: 10px;
            color: #333;
            text-decoration: none;
            font-size: 16px;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div id="sidebar"></div>
        <div id="viewer">
          <iframe id="frame-viewer" src=""></iframe>
        </div>

        <script>
          const links = ${JSON.stringify(linkArrayForScript, null, 2)};
          const sidebar = document.getElementById('sidebar');
          const iframe = document.getElementById('frame-viewer');

          links.forEach((link, index) => {
            const a = document.createElement('a');
            a.href = "#";
            a.textContent = link.name;
            a.onclick = () => {
              iframe.src = link.url;
            };
            sidebar.appendChild(a);

            if (index === 0) {
              iframe.src = link.url;
            }
          });
        </script>
      </body>
      </html>
    `;

    files[`index.html`] = indexHtmlContent;

    figma.ui.postMessage({
      type: "download",
      files: files
    });
  }
};

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_");
}
