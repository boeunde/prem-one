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

      var targetLayers = await findTargetLayers(frame);

      var textDivs = targetLayers.map(function (layer) {
        var leftPercent = (layer.X / frameWidth) * 100;
        var topPercent = (layer.Y / frameHeight) * 100;
        var widthPercent = (layer.Width / frameWidth) * 100;
        var heightPercent = (layer.Height / frameHeight) * 100;

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

        var attributes = Object.entries(layer).map(([key, value]) => {
          const attrName = key.toLowerCase().replace(/ /g, "-");
          return `data-${attrName}="${escapeHTML(String(value))}"`;
        }).join(' ');

        return '<div class="text-layer" style="' + styles + '" ' + attributes + '></div>';
      }).join('\n');

      var htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${frameName}</title>
          <style>
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; display: flex; justify-content: center; align-items: center; }
            #frame-container { position: relative; width: ${frameWidth / 2}px; height: auto; }
            #background-image { width: 100%; height: auto; display: block; }
            .text-layer { position: absolute; }
            .text-layer:hover { cursor: pointer; }
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
                layer.style.border = '1px solid yellow';
              });
              layer.addEventListener('mouseleave', function () {
                if (lockedLayer === layer) {
                  layer.style.border = '1px solid red';
                } else {
                  layer.style.border = 'none';
                }
              });
              layer.addEventListener('click', function (e) {
                e.stopPropagation();
                if (lockedLayer) { lockedLayer.style.border = 'none'; }
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
              var props = {};
              for (var attr of layer.attributes) {
                if (attr.name.startsWith('data-') && attr.value !== "") {
                  var key = attr.name.replace('data-', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                  props[key] = attr.value;
                }
              }
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
          body { margin: 0; height: 100vh; display: flex; overflow: hidden; font-family: sans-serif; }
          #sidebar { width: 200px; background: #f2f2f2; padding: 20px; box-sizing: border-box; overflow-y: auto; }
          #viewer { flex: 1; background: #ffffff; display: flex; align-items: center; justify-content: center; }
          #properties { width: 300px; background: #fafafa; overflow-y: auto; padding: 10px; border-left: 1px solid #ccc; }
          iframe { width: 100%; height: 100%; border: none; }
          a { display: block; margin-bottom: 10px; color: #333; text-decoration: none; font-size: 16px; }
          a:hover { text-decoration: underline; }
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

async function findTargetLayers(node) {
  var layers = [];
  if ((node.type === "TEXT" || ["VECTOR", "RECTANGLE", "ELLIPSE", "POLYGON"].includes(node.type)) && !node.locked) {
    try {
      if (node.type === "TEXT") await figma.loadFontAsync(node.fontName);
      var props = await extractLayerProps(node);
      if (props) layers.push(props);
    } catch (e) {
      console.log('Font load failed or layer error, skipping node');
    }
  } else if ("children" in node) {
    for (var i = 0; i < node.children.length; i++) {
      var childLayers = await findTargetLayers(node.children[i]);
      layers = layers.concat(childLayers);
    }
  }
  return layers;
}

async function extractLayerProps(node) {
  let colorHex = "#000000";
  let colorOpacityPercent = "";

  if (node.fills && node.fills[0] && node.fills[0].color) {
    colorHex = rgbToHex(node.fills[0].color);
    if (typeof node.fills[0].opacity === "number") {
      colorOpacityPercent = ` (${Math.round(node.fills[0].opacity * 100)}%)`;
    }
  }

  let props = {
    Layername: node.name || "",
    X: node.x,
    Y: node.y,
    Width: node.width,
    Height: node.height,
    Color: colorHex + colorOpacityPercent,
    Opacity: (node.opacity !== undefined ? (node.opacity * 100).toFixed(1) + "%" : "100%")
  };

  if (node.type === "TEXT") {
    Object.assign(props, {
      Content: node.characters || "",
      "Font Family": (node.fontName && node.fontName.family) ? node.fontName.family : "sans-serif",
      "Font Weight": (node.fontName && node.fontName.style) ? node.fontName.style : "Regular",
      "Font Size": node.fontSize || 16,
      "Line Height": (typeof node.lineHeight === 'object' && node.lineHeight.value) ? node.lineHeight.value : "normal",
      "Letter Spacing": (typeof node.letterSpacing === 'object' && node.letterSpacing.value) ? node.letterSpacing.value : 0,
      "Text Align Horizontal": node.textAlignHorizontal || "NONE",
      "Text Align Vertical": node.textAlignVertical || "NONE",
      "Text Auto Resize": node.textAutoResize || "NONE"
    });
  } else if (["VECTOR", "RECTANGLE", "ELLIPSE", "POLYGON"].includes(node.type)) {
    let strokeColor = "N/A";
    let strokeColorAlpha = "";
    if (node.strokes && node.strokes[0] && node.strokes[0].type === "SOLID") {
      strokeColor = rgbToHex(node.strokes[0].color);
      if (typeof node.strokes[0].opacity === "number") {
        strokeColorAlpha = ` (${Math.round(node.strokes[0].opacity * 100)}%)`;
      }
    }

    Object.assign(props, {
      "Stroke Color": strokeColor + strokeColorAlpha
    });

    if (strokeColor !== "N/A") {
      Object.assign(props, {
        "Stroke Weight": node.strokeWeight !== undefined ? node.strokeWeight : "N/A",
        "Dash Pattern": (node.dashPattern && node.dashPattern.length > 0) ? node.dashPattern.join(", ") : "none"
      });
    }

    if ("cornerRadius" in node) {
      if (typeof node.cornerRadius === 'number') {
        props["Corner Radius"] = node.cornerRadius;
      } else {
        props["Top Left Radius"] = node.topLeftRadius || 0;
        props["Top Right Radius"] = node.topRightRadius || 0;
        props["Bottom Left Radius"] = node.bottomLeftRadius || 0;
        props["Bottom Right Radius"] = node.bottomRightRadius || 0;
      }
    }
  }

  return props;
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