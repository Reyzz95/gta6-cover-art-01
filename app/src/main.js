'use strict';

const byId = id => document.getElementById(id);
const canvas = byId('cover');
const stage = document.querySelector('.stage');
const artwork = document.querySelector('.artwork');
const { clamp, draw, formats, layouts, photoBounds } = CoverArt;
const freshCrop = (photo = -1) => ({ photo, x: .5, y: .5, zoom: 1 });
const state = {
  format: 'square', layout: 'hero', photos: [], crops: [],
  title: byId('title').value, tagline: byId('tagline').value,
};

let active = 0, panels = [], selectionVisible = false, pendingFrame = 0, drag;
function currentCrop() {
  return state.crops[active];
}
function status(message) {
  byId('status').textContent = message;
}
function option(text, value) {
  return new Option(text, value);
}

function sizePreview() {
  const [width, height] = formats[state.format];
  const previewScale = Math.min(stage.clientWidth / width, stage.clientHeight / height);
  artwork.style.width = width * previewScale + 'px';
  artwork.style.height = height * previewScale + 'px';
}

function paint() {
  cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  panels = draw(canvas, state);
  const selection = byId('selection');
  selection.hidden = !selectionVisible;
  const rect = panels[active];
  selection.style.left = rect.x / canvas.width * 100 + '%';
  selection.style.top = rect.y / canvas.height * 100 + '%';
  selection.style.width = rect.w / canvas.width * 100 + '%';
  selection.style.height = rect.h / canvas.height * 100 + '%';
}

function queuePaint() {
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(paint);
}

function syncCrop() {
  const selectedCrop = currentCrop();
  byId('assignment').value = selectedCrop.photo;
  byId('zoom').disabled = byId('reset').disabled = selectedCrop.photo < 0;
  byId('zoom').value = selectedCrop.zoom;
  byId('zoom-value').textContent = Math.round(selectedCrop.zoom * 100) + '%';
  for (const button of byId('panels').children) {
    button.setAttribute('aria-pressed', Number(button.dataset.panel) === active);
  }
  for (const button of byId('photos').children) {
    button.setAttribute('aria-pressed', Number(button.dataset.photo) === selectedCrop.photo);
  }
}

const choosePanel = index => {
  active = index;
  selectionVisible = true;
  syncCrop();
  queuePaint();
};

function assign(index) {
  if (currentCrop().photo !== index) {
    state.crops[active] = freshCrop(index);
  }
  choosePanel(active);
}

function syncPhotos() {
  const photoList = byId('photos');
  const assignment = byId('assignment');
  photoList.replaceChildren();
  assignment.replaceChildren(option('Illustrated sunset', -1));
  state.photos.forEach(({ image, name }, index) => {
    const button = document.createElement('button');
    const thumbnail = image.cloneNode();
    thumbnail.alt = '';
    button.append(thumbnail);
    button.dataset.photo = index;
    button.title = button.ariaLabel = 'Assign ' + name + ' to selected panel';
    button.addEventListener('click', () => assign(index));
    photoList.append(button);
    assignment.add(option(name, index));
  });
  syncCrop();
}

function setFormat(format) {
  state.format = format;
  byId('format').value = format;
  byId('dimensions').textContent = formats[format].join(' × ') + ' px';
  sizePreview();
  paint();
}

function setLayout(layout) {
  state.layout = layout;
  state.crops = layouts[layout].map((_, index) =>
    state.crops[index] ?? freshCrop(state.photos.length ? index % state.photos.length : -1));
  active = Math.min(active, state.crops.length - 1);
  const panelControls = byId('panels');
  panelControls.replaceChildren();
  state.crops.forEach((_, index) => {
    const button = document.createElement('button');
    button.dataset.panel = index;
    button.textContent = 'Panel ' + (index + 1);
    button.addEventListener('click', () => choosePanel(index));
    panelControls.append(button);
  });
  for (const button of byId('layouts').children) {
    button.setAttribute('aria-pressed', button.dataset.layout === layout);
  }
  syncCrop();
  paint();
}

async function decode(url, name) {
  const decodedImage = new Image();
  decodedImage.src = url;
  await decodedImage.decode();
  return { image: decodedImage, name };
}

let sampleDataPromise;
function loadSampleData() {
  return sampleDataPromise ??= new Promise((resolve, reject) => {
    const sampleScript = document.createElement('script');
    sampleScript.src = './samples/sample-data.min.js';
    sampleScript.onload = () => resolve(globalThis.AfterglowSamples);
    sampleScript.onerror = () => {
      sampleDataPromise = undefined;
      sampleScript.remove();
      reject(new Error('Could not load sample data'));
    };
    document.head.append(sampleScript);
  });
}

async function addSamples(names = sampleNames) {
  // File URLs can display nearby images but can taint an export canvas.
  const embeddedSamples = location.protocol === 'file:' ? await loadSampleData() : null;
  const samples = await Promise.all(names.map(name => decode(embeddedSamples?.[name] ?? './samples/' + name + '.jpg',
    name === 'pier' ? 'Pier' : 'Boulevard')));
  const firstPhoto = state.photos.length;
  state.photos.push(...samples);
  state.crops = state.crops.map((_, index) => freshCrop(firstPhoto + index % samples.length));
  syncPhotos();
  paint();
}

async function addFiles(files) {
  if (!files.length) return;
  const fileResults = await Promise.allSettled(files.map(async file => {
    const objectUrl = URL.createObjectURL(file);
    try {
      return await decode(objectUrl, file.name);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }));
  const loaded = fileResults.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!loaded.length) {
    status('No images could be opened.');
    return;
  }
  const first = state.photos.length;
  state.photos.push(...loaded);
  if (first === 0) {
    state.crops = state.crops.map((_, index) => freshCrop(index % loaded.length));
  } else {
    state.crops[active] = freshCrop(first);
  }
  syncPhotos();
  paint();
  status(loaded.length === files.length ? loaded.length + ' added' : loaded.length + ' added · some files could not be opened');
}

function point(event) {
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - canvasRect.left) / canvasRect.width * canvas.width,
    y: (event.clientY - canvasRect.top) / canvasRect.height * canvas.height,
  };
}

const hit = ({ x, y }) => {
  return panels.findIndex(panel =>
    x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h);
};

function zoomTo(value, anchor) {
  const crop = currentCrop();
  const photo = state.photos[crop.photo]?.image;
  if (!photo) return;
  const panel = panels[active];
  const previousBounds = photoBounds(panel, photo, crop);
  crop.zoom = clamp(value, 1, 4);
  const nextBounds = photoBounds(panel, photo, crop);
  const center = anchor ?? { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };
  if (nextBounds.w > panel.w) {
    crop.x = clamp((center.x - (center.x - previousBounds.x) / previousBounds.w * nextBounds.w - panel.x) / (panel.w - nextBounds.w));
  }
  if (nextBounds.h > panel.h) {
    crop.y = clamp((center.y - (center.y - previousBounds.y) / previousBounds.h * nextBounds.h - panel.y) / (panel.h - nextBounds.h));
  }
  syncCrop();
  queuePaint();
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || drag) return;
  const cursor = point(event);
  const index = hit(cursor);
  if (index < 0) {
    selectionVisible = false;
    queuePaint();
    return;
  }
  choosePanel(index);
  const crop = currentCrop();
  const photo = state.photos[crop.photo]?.image;
  if (!photo) return;
  const panel = panels[index];
  drag = { pointer: event.pointerId, cursor, panel, crop, x: crop.x, y: crop.y,
    bounds: photoBounds(panel, photo, crop) };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (drag?.pointer !== event.pointerId) return;
  const pointerPosition = point(event);
  const overflowX = drag.bounds.w - drag.panel.w;
  const overflowY = drag.bounds.h - drag.panel.h;
  if (overflowX > 0) {
    drag.crop.x = clamp(drag.x - (pointerPosition.x - drag.cursor.x) / overflowX);
  }
  if (overflowY > 0) {
    drag.crop.y = clamp(drag.y - (pointerPosition.y - drag.cursor.y) / overflowY);
  }
  queuePaint();
});
canvas.addEventListener('lostpointercapture', () => {
  drag = null;
});
canvas.addEventListener('wheel', event => {
  const cursor = point(event);
  const index = hit(cursor);
  if (index < 0 || !state.photos[state.crops[index].photo]) return;
  event.preventDefault();
  if (drag) return;
  choosePanel(index);
  const step = event.deltaMode === 0 ? event.deltaY : event.deltaY * 18;
  zoomTo(currentCrop().zoom * Math.exp(-step * .002), cursor);
}, { passive: false });

byId('layouts').addEventListener('click', event => {
  const button = event.target.closest('[data-layout]');
  if (button) setLayout(button.dataset.layout);
});
byId('format').addEventListener('change', event => setFormat(event.target.value));
for (const field of ['title', 'tagline']) {
  byId(field).addEventListener('input', event => {
    state[field] = event.target.value;
    queuePaint();
  });
}
byId('assignment').addEventListener('change', event => assign(Number(event.target.value)));
byId('zoom').addEventListener('input', event => zoomTo(Number(event.target.value)));
byId('reset').addEventListener('click', () => {
  state.crops[active] = freshCrop(currentCrop().photo);
  choosePanel(active);
});
byId('drop').addEventListener('click', () => byId('files').click());
byId('files').addEventListener('change', event => {
  addFiles(Array.from(event.target.files));
  event.target.value = '';
});
byId('demo').addEventListener('click', async () => {
  const demoButton = byId('demo');
  demoButton.disabled = true;
  try {
    await addSamples();
    status('Sample photos loaded');
  } catch {
    status('Sample photos could not be opened.');
    demoButton.disabled = false;
  }
});
window.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  document.body.classList.add('dropping');
});
window.addEventListener('dragleave', event => {
  if (!event.relatedTarget) document.body.classList.remove('dropping');
});
window.addEventListener('drop', event => {
  event.preventDefault();
  document.body.classList.remove('dropping');
  addFiles(Array.from(event.dataTransfer.files));
});

byId('export').addEventListener('click', () => {
  paint();
  const exportName = 'afterglow-' + canvas.width + 'x' + canvas.height + '.png';
  canvas.toBlob(blob => {
    if (!blob) {
      status('The cover could not be exported.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = exportName;
    downloadLink.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status('PNG downloaded');
  }, 'image/png');
});

async function start() {
  const shot = shotOptions(location.search);
  document.body.classList.toggle('shot-cover', Boolean(shot?.coverOnly));
  if (shot) {
    for (const field of ['title', 'tagline']) {
      if (shot[field] !== null) {
        state[field] = byId(field).value = shot[field].slice(0, byId(field).maxLength);
      }
    }
  }
  setLayout(Object.hasOwn(layouts, shot?.layout) ? shot.layout : 'hero');
  setFormat(Object.hasOwn(formats, shot?.format) ? shot.format : 'square');
  new ResizeObserver(sizePreview).observe(stage);
  await Promise.allSettled([document.fonts.load('900 32px StudioDisplay'), document.fonts.load('750 24px StudioText')]);
  if (shot) {
    try {
      await addSamples(shot.samples);
      if (state.crops[shot.sky]) {
        state.crops[shot.sky] = freshCrop();
        syncCrop();
      }
      byId('demo').disabled = true;
    } catch {
      status('Sample photos could not be opened.');
    }
  }
  paint();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
start();
