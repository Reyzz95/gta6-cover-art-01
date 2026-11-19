'use strict';

const CoverArt = (() => {
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const formats = { square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] };
  const layouts = {
    hero: [[0, 0, .577, 1], [.577, 0, .423, .51], [.577, .51, .423, .49]],
    grid: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
    triptych: [[0, 0, .31, 1], [.31, 0, .38, 1], [.69, 0, .31, 1]],
  };

  function geometry(layout, width, height) {
    const unit = Math.min(width, height);
    const margin = unit * .032, gap = unit * .012;
    const fieldWidth = width - 2 * margin + gap;
    const fieldHeight = height - margin - unit * .115 + gap;
    return layouts[layout].map(([x, y, w, h]) => ({
      x: margin + x * fieldWidth, y: margin + y * fieldHeight,
      w: w * fieldWidth - gap, h: h * fieldHeight - gap,
    }));
  }

  function photoBounds(panel, image, crop) {
    const scale = Math.max(panel.w / image.naturalWidth, panel.h / image.naturalHeight) * crop.zoom;
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    return { w, h, x: panel.x + (panel.w - w) * crop.x, y: panel.y + (panel.h - h) * crop.y };
  }

  function gradient(ctx, x, y, dx, dy, stops) {
    const fill = ctx.createLinearGradient(x, y, x + dx, y + dy);
    for (const [at, tint] of stops) fill.addColorStop(at, tint);
    return fill;
  }

  function drawSun(ctx, x, y, radius) {
    const halo = ctx.createRadialGradient(x, y, radius * .2, x, y, radius * 2.2);
    halo.addColorStop(0, '#ffca8bba');
    halo.addColorStop(.45, '#fb647b60');
    halo.addColorStop(1, '#ff529300');
    ctx.fillStyle = halo;
    ctx.fillRect(x - radius * 2.2, y - radius * 2.2, radius * 4.4, radius * 4.4);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = gradient(ctx, x, y - radius, 0, radius * 2, [
      [0, '#fff4b1'], [.48, '#ffb56d'], [1, '#fa6590'],
    ]);
    const line = radius / 10;
    for (let row = 0; row < 20; row++) {
      ctx.fillRect(x - radius, y - radius + row * line, radius * 2, line * (1 - Math.max(0, row - 8) * .056));
    }
    ctx.restore();
  }

  function drawSky(ctx, panel, index, ornamental = true) {
    const { x, y, w, h } = panel;
    ctx.fillStyle = gradient(ctx, x, y, w * .15, h, [
      [0, '#33254e'], [.37, '#b8447c'], [.66, '#f39080'], [.68, '#642f67'], [1, '#211a3a'],
    ]);
    ctx.fillRect(x, y, w, h);
    drawSun(ctx, x + w * (index % 2 ? .62 : .43), y + h * .41, Math.min(w, h) * .23);
    if (!ornamental) return;
    ctx.fillStyle = '#39203c';
    for (let i = 0; i < 22; i++) {
      const height = h * (.035 + ((i * 43 + index * 13) % 27) / 240);
      ctx.fillRect(x + i * w / 22, y + h * .67 - height, w / 24, height);
    }
    for (let i = 1; i < 16; i++) {
      const length = w * (.08 + ((i * 13) % 23) / 100);
      ctx.fillStyle = i % 2 ? '#ffafac48' : '#f477a744';
      ctx.fillRect(x + w * .52 - length / 2, y + h * (.67 + i * i / 780), length, h * .004);
    }
  }

  function paintPanel(ctx, panel, photo, crop, index) {
    const { x, y, w, h } = panel;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (!photo) {
      drawSky(ctx, panel, index);
    } else {
      const bounds = photoBounds(panel, photo, crop);
      ctx.filter = 'contrast(1.22) saturate(1.3) brightness(1.06)';
      ctx.drawImage(photo, bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = gradient(ctx, x, y, w * .28, h, [
        [0, index % 2 ? '#8f84ee' : '#fba971'], [.46, '#ff7786'], [1, '#3c174e'],
      ]);
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    const vignette = ctx.createRadialGradient(x + w * .5, y + h * .46, Math.min(w, h) * .15,
      x + w * .5, y + h * .46, Math.hypot(w, h) * .55);
    vignette.addColorStop(0, '#1b0b2900');
    vignette.addColorStop(1, '#180923a8');
    ctx.fillStyle = vignette;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = '#ffe1b986';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  const grain = document.createElement('canvas');
  grain.width = grain.height = 192;
  const grainContext = grain.getContext('2d');
  const pixels = grainContext.createImageData(grain.width, grain.height);
  let seed = 123456;
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels.data.fill(seed & 256 ? 255 : 0, offset, offset + 3);
    pixels.data[offset + 3] = seed >>> 28;
  }
  grainContext.putImageData(pixels, 0, 0);

  function drawCaption(ctx, width, height, title, tagline) {
    const unit = Math.min(width, height), middle = width / 2;
    const bottom = height - unit * .094;
    ctx.fillStyle = gradient(ctx, 0, height * .49, 0, height * .51, [
      [0, '#1b0c2800'], [.56, '#1b0c2890'], [.9, '#1b1026fa'], [1, '#1b1026'],
    ]);
    ctx.fillRect(unit * .025, height * .49, width - unit * .05, height * .49);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const words = title.trim().toUpperCase().split(/\s+/);
    const wide = width / height > 1.4;
    const displayFont = 'StudioDisplay, Impact, "Arial Narrow", sans-serif';
    const available = width - unit * .16;
    let rows = [words.join(' ')];
    if (!wide && words.length > 1) {
      ctx.font = '900 100px ' + displayFont;
      const candidates = words.slice(1).map((_, index) => [
        words.slice(0, index + 1).join(' '), words.slice(index + 1).join(' '),
      ]);
      rows = candidates.reduce((best, pair) =>
        Math.max(...pair.map(line => ctx.measureText(line).width)) <
        Math.max(...best.map(line => ctx.measureText(line).width)) ? pair : best);
    }
    let size = unit * (wide ? .224 : .19);
    ctx.font = '900 ' + size + 'px ' + displayFont;
    const longest = Math.max(...rows.map(line => ctx.measureText(line).width));
    if (longest > available) size *= available / longest;
    ctx.font = '900 ' + size + 'px ' + displayFont;
    const first = bottom - unit * .06 - (rows.length - 1) * size * .84;
    rows.forEach((line, index) => {
      const baseline = first + index * size * .84;
      ctx.strokeStyle = '#100b1c';
      ctx.lineWidth = unit * .019;
      ctx.strokeText(line, middle + unit * .008, baseline + unit * .012);
      ctx.strokeStyle = '#291331';
      ctx.lineWidth = unit * .012;
      ctx.strokeText(line, middle, baseline);
      ctx.fillStyle = gradient(ctx, middle, baseline - size * .82, 0, size * .88, [
        [0, '#fff5d8'], [.44, '#ffd09d'], [1, '#ff83a3'],
      ]);
      ctx.fillText(line, middle, baseline);
    });
    ctx.fillStyle = '#fce0c9';
    ctx.font = '750 ' + unit * .021 + 'px StudioText, sans-serif';
    ctx.letterSpacing = unit * .004 + 'px';
    ctx.fillText(tagline.trim().toUpperCase(), middle, bottom, available);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#ed8bac';
    for (const offset of [-1, 0, 1]) {
      ctx.save();
      ctx.translate(middle + offset * unit * .022, height - unit * .043);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-unit * .003, -unit * .003, unit * .006, unit * .006);
      ctx.restore();
    }
  }

  function draw(canvas, state) {
    const [width, height] = formats[state.format];
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    const unit = Math.min(width, height);
    ctx.fillStyle = '#1b1026';
    ctx.fillRect(0, 0, width, height);
    const panels = geometry(state.layout, width, height);
    panels.forEach((panel, index) => {
      const crop = state.crops[index];
      paintPanel(ctx, panel, state.photos[crop.photo]?.image, crop, index);
    });
    ctx.fillStyle = ctx.createPattern(grain, 'repeat');
    ctx.fillRect(0, 0, width, height);
    drawCaption(ctx, width, height, state.title, state.tagline);
    const border = unit * .014;
    ctx.strokeStyle = '#f5a697';
    ctx.lineWidth = Math.max(2, unit * .002);
    ctx.strokeRect(border, border, width - 2 * border, height - 2 * border);
    return panels;
  }

  return { clamp, draw, formats, layouts, photoBounds };
})();
