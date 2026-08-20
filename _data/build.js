// Build metadata. `time` versions the service-worker precache (sw.njk): each
// build gets a fresh precache and activation deletes the previous one.
export default {
  time: new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14),
};
