figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "refresh-frames") {
    const frames = getAllTopFrames();
    figma.ui.postMessage({ type: "show-frame-list", frames });
  }

  if (msg.type === "export") {
    const selectedNodes = msg.selectedIds
      .map(id => figma.getNodeById(id))
      .filter(node => node && node.type === "FRAME");

    const pageOrderMap = new Map();
    figma.root.children.forEach((page, index) => {
      if (page.type === 'PAGE') pageOrderMap.set(page.id, index + 1);
    });

    const pageGroupedFrames = new Map();
    for (const frame of selectedNodes) {
      const page = frame.parent;
      if (!pageGroupedFrames.has(page.id)) pageGroupedFrames.set(page.id, []);
      pageGroupedFrames.get(page.id).push(frame);
    }

    const files = {};
    const linkArrayForScript = [];
    for (const [pageId, frames] of pageGroupedFrames.entries()) {
      const page = frames[0].parent;
      const pageName = sanitizeFilename(page.name);
      const pageIndex = String(pageOrderMap.get(pageId)).padStart(2, '0');

      frames.sort((a, b) => a.y - b.y || a.x - b.x);

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const frameName = sanitizeFilename(frame.name);
        const frameIndex = String(i + 1).padStart(3, '0');
        const finalName = `${pageIndex}-${pageName}-${frameIndex}-${frameName}`;

        const exportOptions = { format: "PNG", constraint: { type: "SCALE", value: 2 } };

        let pngBytes;
        try {
          pngBytes = await frame.exportAsync(exportOptions);
        } catch (e) {
          console.error(`❌ Export failed for frame: ${frame.name} (${frame.id})`, e);
          continue;
        }

        const frameWidth = frame.width;
        const frameHeight = frame.height;
        const targetLayers = await findTargetLayers(frame, frame.id);

        var idMap = {};
        var treeRoots = [];

        for (var a = 0; a < targetLayers.length; a++) {
          var layer = targetLayers[a];
          layer.children = []; // 트리용 children 배열

          idMap[layer["__nodeId"]] = layer;
        }

        for (var b = 0; b < targetLayers.length; b++) {
          var layer = targetLayers[b];
          var parentId = layer["__parentId"];

          if (parentId && idMap[parentId]) {
            idMap[parentId].children.push(layer);
          } else {
            treeRoots.push(layer);
          }
        }

        console.log("[TYPE]", layer.Layername, layer["__typeName"]);

        function renderLayerTree(layer, parentSize, frameOffset) {
          var isScreen = layer["__isScreen"];

          var parentWidth = parentSize ? parentSize.width : frameWidth;
          var parentHeight = parentSize ? parentSize.height : frameHeight;

          var renderX = layer["__visualX"] !== undefined ? layer["__visualX"] : layer.X;
          var renderY = layer["__visualY"] !== undefined ? layer["__visualY"] : layer.Y;
          var renderWidth = (layer["__visualWidth"] !== undefined) ? layer["__visualWidth"] : layer.Width;
          var renderHeight = (layer["__visualHeight"] !== undefined) ? layer["__visualHeight"] : layer.Height;

          var leftPercent = isScreen ? 0 : (renderX / parentWidth) * 100;
          var topPercent = isScreen ? 0 : (renderY / parentHeight) * 100;
          var widthPercent = (renderWidth / parentWidth) * 100;
          var heightPercent = (renderHeight / parentHeight) * 100;

          var frameLeft = frameOffset ? frameOffset.x : 0;
          var frameTop = frameOffset ? frameOffset.y : 0;

          var relativeX = renderX - frameLeft;
          var relativeY = renderY - frameTop;

          var leftPercent = isScreen ? 0 : (relativeX / parentWidth) * 100;
          var topPercent = isScreen ? 0 : (relativeY / parentHeight) * 100;


          if (layer["__typeName"] === "LINE" || layer["__typeName"] === "VECTOR") {
            console.log("[CHECK]", layer.Layername, {
              __visualWidth: layer["__visualWidth"],
              __visualHeight: layer["__visualHeight"],
              Width: layer.Width,
              Height: layer.Height
            });
          }


          var layerType = "layer";

          if (layer["* TEXT Properties"]) layerType = "text";
          else if (layer["* RECTANGLE Properties"]) layerType = "rectangle";
          else if (layer["* VECTOR Properties"]) layerType = "vector";
          else if (layer["* ELLIPSE Properties"]) layerType = "ellipse";
          else if (layer["* LINE Properties"]) layerType = "line";
          else if (layer["* POLYGON Properties"]) layerType = "polygon";
          else if (layer["* STAR Properties"]) layerType = "star";
          else if (layer["* FRAME Properties"]) layerType = "frame";

          var className = "layer-" + layerType + (isScreen ? " screen" : " layer-suspect");

          var styles = (
            "position: absolute; top: " + topPercent + "%; left: " + leftPercent +
            "%; width: " + widthPercent + "%; height: " + heightPercent +
            "%; box-sizing: border-box; pointer-events: auto; border: none;"
          );

          var attributes = "";
          for (var key in layer) {
            if (layer.hasOwnProperty(key)) {
              if (key.indexOf("*") !== 0 && key.indexOf("__") !== 0) {
                var attrName = key.toLowerCase().replace(/ /g, "-");
                attributes += ' data-' + attrName + '="' + escapeHTML(String(layer[key])) + '"';
              }
            }
          }

          var childrenHTML = "";

          for (var j = 0; j < layer.children.length; j++) {
            childrenHTML += renderLayerTree(layer.children[j], {
              width: renderWidth,
              height: renderHeight
            }, {
              x: renderX,
              y: renderY
            });
          }

          return '<div class="' + className + '" style="' + styles + '"' + attributes + '>' + childrenHTML + '</div>';
        }

        var textDivs = "";
        for (var k = 0; k < treeRoots.length; k++) {
          textDivs += renderLayerTree(treeRoots[k], {
            width: frame.width,
            height: frame.height
          }, {
            x: frame.absoluteBoundingBox.x,
            y: frame.absoluteBoundingBox.y
          });
        }

        const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${finalName}</title><style>body, html { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #fff; display: grid; place-items: center; } #topbar { position: absolute; top: 0; width: 100%; background: #f2f2f2; padding: 8px; font-size: 14px; border-bottom: 1px solid #ccc; display: flex; justify-content: center; z-index: 10; } #frame-container { position: relative; box-shadow: 0 1px 5px #d9d9d9; } #background-image { display: block; max-width: none; } .layer-suspect { position: absolute; } .layer-suspect:hover { cursor: pointer; }</style></head><body><div id="topbar"><label>Zoom: <select id="zoom-select"><option value="0.25">25%</option><option value="0.33">33%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></label></div><div id="frame-container"><img id="background-image" src="../Thumbnails/${finalName}.png" alt="${finalName}">${textDivs}</div>
        
          <script>
            document.addEventListener('DOMContentLoaded', function () {
              const image = document.getElementById('background-image');
              const zoomSelect = document.getElementById('zoom-select');
              function applyZoom() {
                const scale = parseFloat(zoomSelect.value);
                image.style.width = (scale * image.naturalWidth / 2) + 'px';
              }
              zoomSelect.addEventListener('change', applyZoom);
              window.addEventListener('load', applyZoom);

              var lockedLayer = null;
              var layers = document.querySelectorAll('.layer-suspect');

              document.addEventListener('mousemove', function (e) {
                var topElement = document.elementFromPoint(e.clientX, e.clientY);
                layers.forEach(function (layer) {
                  if (layer === lockedLayer) return;
                  if (layer === topElement) {
                    layer.style.border = '1px solid yellow';
                  } else {
                    layer.style.border = 'none';
                  }
                });
              });

              layers.forEach(function (layer) {
                layer.addEventListener('click', function (e) {
                  if (e.target !== document.elementFromPoint(e.clientX, e.clientY)) return;
                  e.stopPropagation();
                  if (lockedLayer) {
                    lockedLayer.style.border = 'none';
                  }
                  lockedLayer = layer;
                  layer.style.border = '1px solid red';
                  sendProperties(layer);
                });

                layer.addEventListener('mouseleave', function (e) {
                  if (e.target !== document.elementFromPoint(e.clientX, e.clientY)) return;
                  if (lockedLayer === layer) {
                    layer.style.border = '1px solid red';
                  } else {
                    layer.style.border = 'none';
                  }
                });
              });

              document.addEventListener('click', function (e) {
                var target = document.elementFromPoint(e.clientX, e.clientY);
                if (!target || target.closest('.layer-suspect') == null) {
                  if (lockedLayer) {
                    lockedLayer.style.border = 'none';
                    lockedLayer = null;
                    clearProperties();
                  }
                }
              });

              var frameContainer = document.getElementById('frame-container');
              if (frameContainer) {
                frameContainer.addEventListener('click', function (e) {
                });
              } else {
              }

              var background = document.getElementById('background-image');
              if (background) {
                background.addEventListener('click', function (e) {
                });
              }

              function sendProperties(layer) {
                var props = {};
                for (var attr of layer.attributes) {
                  if (attr.name.startsWith('data-') && attr.value !== "") {
                    var key = attr.name.replace('data-', '')
                      .split('-')
                      .map(function (word) {
                        return word.charAt(0).toUpperCase() + word.slice(1);
                      })
                      .join(' ');
                    props[key] = attr.value;
                  }
                }
                parent.postMessage({ pluginMessage: { type: "show-properties", props: props } }, '*');
              }

              function clearProperties() {
                parent.postMessage({ pluginMessage: { type: "clear-properties" } }, '*');
              }
            });
          </script>
        </body></html>`;

        files[`Thumbnails/${finalName}.png`] = pngBytes;
        files[`Frames/${finalName}.html`] = htmlContent;
        linkArrayForScript.push({ name: frameName, page: page.name, url: `Frames/${finalName}.html` });
      }
    }
    const indexHtmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Exported Frames</title><style>body { margin: 0; height: 100vh; display: flex; overflow: hidden; font-family: sans-serif; } #sidebar { width: 200px; background: #f2f2f2; padding: 20px; box-sizing: border-box; overflow-y: auto; } #viewer { flex: 1; background: #ffffff; display: flex; align-items: center; justify-content: center; } #properties { width: 300px; background: #fafafa; overflow-y: auto; padding: 10px; border-left: 1px solid #ccc; } iframe { width: 100%; height: 100%; border: none; } a { display: block; margin-bottom: 0px; color: #333; text-decoration: none; font-size: 16px; } a:hover { text-decoration: underline; } p { margin: 0 0 10px 0; color: #999; font-size: 11px; }</style></head><body><div id="sidebar"></div><div id="viewer"><iframe id="frame-viewer" src=""></iframe></div><div id="properties">Hover a text layer to see properties</div>
      <script>
        var links = ${JSON.stringify(linkArrayForScript)}; 
        var sidebar = document.getElementById('sidebar'); 
        var iframe = document.getElementById('frame-viewer'); 
        var properties = document.getElementById('properties'); 

        links.forEach(function (link, index) { 
          var a = document.createElement('a'); 
          a.href = "#"; a.textContent = link.name; 
          a.onclick = function () { 
          iframe.src = link.url; 
          properties.innerHTML = "Hover a text layer to see properties"; 
        }; 

        sidebar.appendChild(a); 

        var p = document.createElement('p'); 
        p.textContent = link.page; sidebar.appendChild(p); 
        if (index === 0) iframe.src = link.url; }); 
          window.addEventListener('message', function (event) { 
          if (!event.data || typeof event.data !== "object" || !event.data.pluginMessage) return; 

          const message = event.data.pluginMessage; 

            if (message.type === "show-properties") { 
              let html = ""; 

              for (let key in message.props) { 
                html += "<div><b>" + key + ":</b> " + message.props[key] + "</div>"; 
              } 

            properties.innerHTML = html; 
            } 

          if (message.type === "clear-properties") { 
          properties.innerHTML = "Hover a text layer to see properties"; 
          } 
        });
      </script>
    </body></html>`;

    files["index.html"] = indexHtmlContent;
    figma.ui.postMessage({ type: "download", files });
  }
};

function getAllTopFrames() {
  const frames = [];
  for (const page of figma.root.children) {
    if (page.type === 'PAGE') {
      for (const node of page.children) {
        if (node.type === 'FRAME') {
          frames.push({ id: node.id, name: `${page.name} / ${node.name}`, pageId: page.id });
        }
      }
    }
  }
  return frames;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_");
}

async function findTargetLayers(node, rootFrameId) {
  let layers = [];

  if (
    ["TEXT", "VECTOR", "RECTANGLE", "ELLIPSE", "POLYGON", "LINE", "STAR", "FRAME"].includes(node.type) &&
    !node.locked &&
    node.visible !== false
  ) {
    try {
      if (node.type === "TEXT") await figma.loadFontAsync(node.fontName);
      const props = await extractLayerProps(node, rootFrameId);
      if (props) layers.push(props);
    } catch (e) {
      console.log('Font load failed or layer error, skipping node');
    }
  }

  if ("children" in node) {
    for (const child of node.children) {
      const childLayers = await findTargetLayers(child, rootFrameId);
      layers.push(...childLayers);
    }
  }

  return layers;
}

async function extractLayerProps(node, rootFrameId = null) {
  let props = {};
  const isScreen = (node.type === "FRAME" && node.id === rootFrameId);

  const baseProps = {
    Layername: node.name || "",
    X: node.x,
    Y: node.y,
    Width: node.width,
    Height: node.height,
  };

  if (node.type === "FRAME" && node.absoluteBoundingBox) {
    baseProps["__visualX"] = node.absoluteBoundingBox.x;
    baseProps["__visualY"] = node.absoluteBoundingBox.y;
    baseProps["__visualWidth"] = node.absoluteBoundingBox.width;
    baseProps["__visualHeight"] = node.absoluteBoundingBox.height;
  } else if (node.absoluteRenderBounds) {
    baseProps["__visualX"] = node.absoluteRenderBounds.x;
    baseProps["__visualY"] = node.absoluteRenderBounds.y;
    baseProps["__visualWidth"] = node.absoluteRenderBounds.width;
    baseProps["__visualHeight"] = node.absoluteRenderBounds.height;
  } else if (node.absoluteBoundingBox) {
    baseProps["__visualX"] = node.absoluteBoundingBox.x;
    baseProps["__visualY"] = node.absoluteBoundingBox.y;
    baseProps["__visualWidth"] = node.absoluteBoundingBox.width;
    baseProps["__visualHeight"] = node.absoluteBoundingBox.height;
  } else {
    baseProps["__visualX"] = node.x;
    baseProps["__visualY"] = node.y;
    baseProps["__visualWidth"] = node.width;
    baseProps["__visualHeight"] = node.height;
  }

  if (isScreen) {
    for (const key in baseProps) props[key] = baseProps[key];
  } else {
    let colorHex = "N/A", colorOpacityPercent = "", tips = [], commonProps = {}, typeProps = {};

    if (node.fills && node.fills[0]) {
      const fill = node.fills[0];
      if (fill.type === "SOLID" && fill.color) {
        colorHex = rgbToHex(fill.color);
        if (typeof fill.opacity === "number") colorOpacityPercent = ` (${Math.round(fill.opacity * 100)}%)`;
      } else {
        colorHex = fill.type;
      }
      if (node.fills.length > 1) tips.push("Fill이 2개 이상 적용되어 있습니다.");
    }

    for (const key in baseProps) commonProps[key] = baseProps[key];
    commonProps["Rotation"] = node.rotation !== undefined ? Math.round(node.rotation) + "°" : "0°";
    commonProps["Color"] = colorHex + colorOpacityPercent;
    commonProps["Opacity"] = node.opacity !== undefined ? Math.round(node.opacity * 100) + "%" : "100%";

    if (["LINE", "VECTOR"].includes(node.type)) {
      if (commonProps.Width <= 0 && node.strokeWeight) commonProps.Width = node.strokeWeight;
      if (commonProps.Height <= 0 && node.strokeWeight) commonProps.Height = node.strokeWeight;
    }

    if (node.rotation && Math.round(node.rotation) !== 0) tips.push("Rotation이 적용되어 있습니다.");

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
      let strokeColor = "N/A", strokeAlpha = "";
      if (
        node.strokes &&
        node.strokes.length > 0 &&
        node.strokes[0] &&
        node.strokes[0].type === "SOLID"
      ) {
        strokeColor = rgbToHex(node.strokes[0].color);
        if (typeof node.strokes[0].opacity === "number") strokeAlpha = ` (${Math.round(node.strokes[0].opacity * 100)}%)`;
      }

      typeProps["Stroke Color"] = strokeColor + strokeAlpha;
      if (strokeColor !== "N/A") Object.assign(typeProps, {
        "Stroke Weight": (node.strokeWeight !== undefined && node.strokeWeight !== null) ? node.strokeWeight : "N/A",
        "Dash Pattern": (node.dashPattern && node.dashPattern.length > 0) ? node.dashPattern.join(", ") : "none"
      });

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
    } else if (node.type === "FRAME") {
      typeProps = {
        "Is Nested Frame": "true",
        "Child Count": (node.children && node.children.length) ? node.children.length : 0
      };
    }

    props["* Common Properties"] = "---";
    props["Width"] = baseProps.Width;
    props["Height"] = baseProps.Height;
    for (const key in commonProps) if (key !== "Width" && key !== "Height") props[key] = commonProps[key];
    props[`* ${node.type} Properties`] = "---";
    for (const key in typeProps) props[key] = typeProps[key];
    if (tips.length > 0) {
      props["* Tip"] = "---";
      props["*** Tip"] = tips.join("\n");
    }
  }

  props["__isScreen"] = isScreen;
  props["__typeName"] = node.type;
  props["__nodeId"] = node.id;
  props["__parentId"] = node.parent ? node.parent.id : null;

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
