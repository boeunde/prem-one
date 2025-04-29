figma.showUI(__html__);

figma.on("selectionchange", function () {
  const selection = figma.currentPage.selection;
  if (selection.length >= 1 && selection.every(function (node) { return node.type === "FRAME"; })) {
    figma.ui.postMessage({ type: "enable-export", enabled: true });
  } else {
    figma.ui.postMessage({ type: "enable-export", enabled: false });
  }
});

figma.ui.onmessage = async function (msg) {
  if (msg.type === "export") {
    const selection = figma.currentPage.selection;
    const files = {};
    const linkArrayForScript = [];

    for (var i = 0; i < selection.length; i++) {
      var frame = selection[i];
      var exportOptions = {
        format: "PNG",
        constraint: { type: "SCALE", value: 2 }
      };
      var pngBytes = await frame.exportAsync(exportOptions);

      var frameName = sanitizeFilename(frame.name || "exported");
      var frameWidth = frame.width;
      var frameHeight = frame.height;

      var textLayers = await findTextLayers(frame);

      var textDivs = textLayers.map(function (text) {
        var leftPercent = (text.x / frameWidth) * 100;
        var topPercent = (text.y / frameHeight) * 100;
        var widthPercent = (text.width / frameWidth) * 100;
        var heightPercent = (text.height / frameHeight) * 100;

        var styles = `
          position: absolute;
          top: ${topPercent}%;
          left: ${leftPercent}%;
          width: ${widthPercent}%;
          height: ${heightPercent}%;
          box-sizing: border-box;
          pointer-events: auto;
          border: none;
        `.replace(/\s+/g, ' ').trim();

        var attributes = `
          data-font-family="${text.fontFamily}"
          data-font-weight="${text.fontWeight}"
          data-font-size="${text.fontSize}"
          data-line-height="${text.lineHeight}"
          data-letter-spacing="${text.letterSpacing}"
          data-x="${text.x}"
          data-y="${text.y}"
          data-width="${text.width}"
          data-height="${text.height}"
          data-font-color="${text.fontColor}"
          data-opacity="${text.opacity}"
          data-content="${escapeHTML(text.characters)}"
        `.replace(/\s+/g, ' ').trim();

        return '<div class="text-layer" style="' + styles + '" ' + attributes + '></div>';
      }).join('\n');

      var htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${frameName}</title>
          <style>
            body, html {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: #fff;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            #frame-container {
              position: relative;
              width: ${frameWidth / 2}px;
              height: auto;
            }
            #background-image {
              width: 100%;
              height: auto;
              display: block;
            }
            .text-layer {
              position: absolute;
            }
          </style>
        </head>
        <body>
          <div id="frame-container">
            <img id="background-image" src="../Thumbnails/${frameName}.png" alt="${frameName}">
            ${textDivs}
          </div>
          <script>
            var lockedLayer = null;
            var layers = document.querySelectorAll('.text-layer');

            layers.forEach(function (layer) {
              layer.addEventListener('mouseenter', function () {
                if (!lockedLayer) {
                  layer.style.border = '1px solid red';
                }
              });

              layer.addEventListener('mouseleave', function () {
                if (!lockedLayer) {
                  layer.style.border = 'none';
                }
              });

              layer.addEventListener('click', function (e) {
                e.stopPropagation();
                if (lockedLayer) {
                  lockedLayer.style.border = 'none';
                }
                lockedLayer = layer;
                layer.style.border = '1px solid red';
                sendProperties(layer);
              });
            });

            window.addEventListener('click', function () {
              if (lockedLayer) {
                lockedLayer.style.border = 'none';
                lockedLayer = null;
                clearProperties();
              }
            });

            function sendProperties(layer) {
              var props = {
                "Font Family": layer.dataset.fontFamily,
                "Font Weight": layer.dataset.fontWeight,
                "Font Size": layer.dataset.fontSize,
                "Line Height": layer.dataset.lineHeight,
                "Letter Spacing": layer.dataset.letterSpacing,
                "X": layer.dataset.x,
                "Y": layer.dataset.y,
                "Width": layer.dataset.width,
                "Height": layer.dataset.height,
                "Font Color": layer.dataset.fontColor,
                "Opacity": layer.dataset.opacity,
                "Content": layer.dataset.content
              };
              parent.postMessage({ pluginMessage: { type: "show-properties", props: props } }, '*');
            }

            function clearProperties() {
              parent.postMessage({ pluginMessage: { type: "clear-properties" } }, '*');
            }
          </script>
        </body>
        </html>
      `;

      files["Thumbnails/" + frameName + ".png"] = pngBytes;
      files["Frames/" + frameName + ".html"] = htmlContent;
      linkArrayForScript.push({ name: frameName, url: "Frames/" + frameName + ".html" });
    }

    var indexHtmlContent = `
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
          }
          #sidebar {
            width: 300px;
            background: #f2f2f2;
            overflow-y: auto;
            padding: 20px;
          }
          #viewer {
            flex: 1;
            overflow: hidden;
            background: #fff;
          }
          iframe {
            width: 100%;
            height: 100%;
            border: none;
          }
          #properties {
            width: 300px;
            background: #fafafa;
            overflow-y: auto;
            padding: 10px;
            border-left: 1px solid #ccc;
            font-family: sans-serif;
          }
          a {
            display: block;
            margin-bottom: 10px;
            color: #333;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div id="sidebar"></div>
        <div id="viewer">
          <iframe id="frame-viewer" src=""></iframe>
        </div>
        <div id="properties">Hover a text layer to see properties</div>

        <script>
          var links = ${JSON.stringify(linkArrayForScript)};
          var sidebar = document.getElementById('sidebar');
          var iframe = document.getElementById('frame-viewer');
          var properties = document.getElementById('properties');

          links.forEach(function (link, index) {
            var a = document.createElement('a');
            a.href = "#";
            a.textContent = link.name;
            a.onclick = function () {
              iframe.src = link.url;
              properties.innerHTML = "Hover a text layer to see properties";
            };
            sidebar.appendChild(a);
            if (index === 0) {
              iframe.src = link.url;
            }
          });

          window.addEventListener('message', function (event) {
            var message = event.data.pluginMessage;
            if (message.type === "show-properties") {
              var html = "";
              for (var key in message.props) {
                html += "<div><b>" + key + ":</b> " + message.props[key] + "</div>";
              }
              properties.innerHTML = html;
            }
            if (message.type === "clear-properties") {
              properties.innerHTML = "Hover a text layer to see properties";
            }
          });
        </script>
      </body>
      </html>
    `;

    files["index.html"] = indexHtmlContent;

    figma.ui.postMessage({ type: "download", files: files });
  }
};

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_");
}

async function findTextLayers(node) {
  var texts = [];
  if (node.type === "TEXT") {
    try {
      await figma.loadFontAsync(node.fontName);
      var props = await extractTextLayerProps(node);
      if (props) texts.push(props);
    } catch (e) {
      console.log('Font load failed, skipping text node');
    }
  } else if ("children" in node) {
    for (var i = 0; i < node.children.length; i++) {
      var childTexts = await findTextLayers(node.children[i]);
      texts = texts.concat(childTexts);
    }
  }
  return texts;
}

async function extractTextLayerProps(textNode) {
  return {
    characters: textNode.characters !== undefined ? textNode.characters : "",
    fontFamily: textNode.fontName && textNode.fontName.family ? textNode.fontName.family : "sans-serif",
    fontWeight: textNode.fontName && textNode.fontName.style ? textNode.fontName.style : "Regular",
    fontSize: textNode.fontSize || 16,
    lineHeight: textNode.lineHeight && textNode.lineHeight.value ? textNode.lineHeight.value : "normal",
    letterSpacing: textNode.letterSpacing && textNode.letterSpacing.value ? textNode.letterSpacing.value : 0,
    x: textNode.x,
    y: textNode.y,
    width: textNode.width,
    height: textNode.height,
    fontColor: textNode.fills && textNode.fills[0] && textNode.fills[0].color ? rgbToHex(textNode.fills[0].color) : "#000000",
    opacity: textNode.opacity || 1
  };
}

function rgbToHex(color) {
  var r = Math.round(color.r * 255);
  var g = Math.round(color.g * 255);
  var b = Math.round(color.b * 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function escapeHTML(text) {
  return text.replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}
