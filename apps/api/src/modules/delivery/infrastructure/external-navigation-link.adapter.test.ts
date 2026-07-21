import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExternalNavigationLinkAdapter,
  buildGenericMapsDeepLink,
  buildOpenStreetMapNavigationUrl,
} from './external-navigation-link.adapter.js';

test('external navigation OSM url', () => {
  const url = buildOpenStreetMapNavigationUrl('53.9', '27.55');
  assert.match(url, /openstreetmap\.org/);
  assert.match(url, /mlat=53\.9/);
  assert.match(url, /mlon=27\.55/);
});

test('generic maps deep link', () => {
  const url = buildGenericMapsDeepLink('53.9', '27.55');
  assert.match(url, /maps\.google\.com/);
  assert.match(url, /53\.9/);
});

test('adapter returns null without stops', () => {
  const adapter = new ExternalNavigationLinkAdapter();
  assert.equal(adapter.generateExternalNavigationUrl([]), null);
  const url = adapter.generateExternalNavigationUrl([
    { latitude: '53.9006010', longitude: '27.5589720' },
  ]);
  assert.ok(url?.includes('openstreetmap.org'));
});
