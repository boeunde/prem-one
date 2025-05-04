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
            #frame-container { position: relative; width: ${frameWidth / 2}px; height: auto; box-shadow: 0 1px 5px #d9d9d9;}
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
  let layers = [];

  if (
    ["TEXT", "VECTOR", "RECTANGLE", "ELLIPSE", "POLYGON", "LINE", "STAR"].includes(node.type) &&
    !node.locked &&
    node.visible !== false
  ) {
    try {
      if (node.type === "TEXT") await figma.loadFontAsync(node.fontName);
      const props = await extractLayerProps(node);
      if (props) layers.push(props);
    } catch (e) {
      console.log('Font load failed or layer error, skipping node');
    }
  } else if ("children" in node) {
    for (const child of node.children) {
      const childLayers = await findTargetLayers(child);
      layers.push(...childLayers);
    }
  }

  return layers;
}

async function extractLayerProps(node) {
  let colorHex = "N/A";
  let colorOpacityPercent = "";
  let tips = [];
  let commonProps = {};
  let typeProps = {};
  let props = {};

  if (node.fills && node.fills.length > 0 && node.fills[0]) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color) {
      colorHex = rgbToHex(fill.color);
      if (typeof fill.opacity === "number") {
        colorOpacityPercent = ` (${Math.round(fill.opacity * 100)}%)`;
      }
    } else {
      colorHex = fill.type;
    }

    if (node.fills.length > 1) {
      tips.push("Fill이 2개 이상 적용되어 있습니다.");
    }
  }

  commonProps = {
    Layername: node.name || "",
    X: node.x,
    Y: node.y,
    Width: node.width,
    Height: node.height,
    Rotation: node.rotation !== undefined ? Math.round(node.rotation) + "°" : "0°",
    Color: colorHex + colorOpacityPercent,
    Opacity: (node.opacity !== undefined ? Math.round(node.opacity * 100) + "%" : "100%")
  };

  if (["LINE", "VECTOR"].includes(node.type)) {
    if (commonProps.Width <= 0 && node.strokeWeight) {
      commonProps.Width = node.strokeWeight;
    }
    if (commonProps.Height <= 0 && node.strokeWeight) {
    commonProps.Height = node.strokeWeight;
    }
  }

  if (node.rotation && Math.round(node.rotation) !== 0) {
    tips.push("Rotation이 적용되어 있습니다.");
  }

  if (node.type === "TEXT") {
    typeProps = {
      "Content": node.characters || "",
      "Font Family": (node.fontName && node.fontName.family) ? node.fontName.family : "sans-serif",
      "Font Weight": (node.fontName && node.fontName.style) ? node.fontName.style : "Regular",
      "Font Size": node.fontSize || 16,
      "Line Height": (typeof node.lineHeight === 'object' && node.lineHeight.value) ? node.lineHeight.value : "normal",
      "Letter Spacing": (typeof node.letterSpacing === 'object' && node.letterSpacing.value) ? node.letterSpacing.value : 0,
      "Text Align Horizontal": node.textAlignHorizontal || "NONE",
      "Text Align Vertical": node.textAlignVertical || "NONE",
      "Text Auto Resize": node.textAutoResize || "NONE"
    };
  } else if (["VECTOR", "RECTANGLE", "ELLIPSE", "POLYGON", "STAR"].includes(node.type)) {
    let strokeColor = "N/A";
    let strokeColorAlpha = "";
    if (node.strokes && node.strokes[0] && node.strokes[0].type === "SOLID") {
      strokeColor = rgbToHex(node.strokes[0].color);
      if (typeof node.strokes[0].opacity === "number") {
        strokeColorAlpha = ` (${Math.round(node.strokes[0].opacity * 100)}%)`;
      }
    }
  
    typeProps["Stroke Color"] = strokeColor + strokeColorAlpha;
  
    if (strokeColor !== "N/A") {
      Object.assign(typeProps, {
        "Stroke Weight": node.strokeWeight !== undefined ? node.strokeWeight : "N/A",
        "Dash Pattern": (node.dashPattern && node.dashPattern.length > 0) ? node.dashPattern.join(", ") : "none"
      });
    }
  
    if ("cornerRadius" in node) {
      if (typeof node.cornerRadius === 'number') {
        typeProps["Corner Radius"] = node.cornerRadius;
      } else {
        typeProps["Top Left Radius"] = node.topLeftRadius || 0;
        typeProps["Top Right Radius"] = node.topRightRadius || 0;
        typeProps["Bottom Left Radius"] = node.bottomLeftRadius || 0;
        typeProps["Bottom Right Radius"] = node.bottomRightRadius || 0;
      }
    }
  
    if (node.type === "STAR") {
      typeProps["Point Count"] = node.pointCount;
      typeProps["Inner Radius"] = (node.innerRadius * 100).toFixed(1) + "%";
    }
  }

  props["* Common Properties"] = "---";
  for (const key in commonProps) {
    props[key] = commonProps[key];
  }

  props[`* ${node.type} Properties`] = "---";
  for (const key in typeProps) {
    props[key] = typeProps[key];
  }

  if (tips.length > 0) {
    props["* Tip"] = "---";
    props["*** Tip"] = tips.join("\n");
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