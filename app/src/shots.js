'use strict';

const sampleNames = ['boulevard', 'pier'];

function shotOptions(search) {
  const query = new URLSearchParams(search);
  const mode = query.get('shot');
  if (mode !== 'editor' && mode !== 'cover' && query.get('demo') !== '1') return null;
  const photo = sampleNames.includes(query.get('photo')) ? query.get('photo') : 'boulevard';
  return {
    coverOnly: mode === 'cover',
    samples: [photo, ...sampleNames.filter(name => name !== photo)],
    title: query.get('caption'),
    tagline: query.get('tagline'),
    layout: query.get('layout'),
    sky: query.has('sky') ? Number(query.get('sky')) : -1,
    format: query.get('format'),
  };
}
