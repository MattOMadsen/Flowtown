/**
 * Load place/vehicle sprites (PNG with transparency).
 * Fallback: null → canvas silhouette without glow-bubbles.
 */

const PLACE_SRC = {
  town: 'assets/places/town.png',
  capital: 'assets/places/capital.png',
  farm: 'assets/places/farm.png',
  factory: 'assets/places/factory.png',
  harbor: 'assets/places/harbor.png'
};

const VEHICLE_SRC = {
  car: 'assets/vehicles/car.png',
  truck: 'assets/vehicles/truck.png',
  car_fast: 'assets/vehicles/car.png',
  truck_heavy: 'assets/vehicles/truck.png'
};

const placeImgs = {};
const vehicleImgs = {};
let ready = false;
let loadPromise = null;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function loadGameAssets() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const pEntries = Object.entries(PLACE_SRC);
    const vEntries = Object.entries(VEHICLE_SRC);
    const pImgs = await Promise.all(pEntries.map(([, src]) => loadImage(src)));
    const vImgs = await Promise.all(vEntries.map(([, src]) => loadImage(src)));
    pEntries.forEach(([k], i) => { placeImgs[k] = pImgs[i]; });
    vEntries.forEach(([k], i) => { vehicleImgs[k] = vImgs[i]; });
    ready = true;
    return { placeImgs, vehicleImgs };
  })();
  return loadPromise;
}

export function getPlaceSprite(type) {
  return placeImgs[type] || placeImgs.town || null;
}

export function getVehicleSprite(classId, kind) {
  if (classId && vehicleImgs[classId]) return vehicleImgs[classId];
  if (kind === 'truck') return vehicleImgs.truck || null;
  return vehicleImgs.car || null;
}

export function assetsReady() {
  return ready;
}
