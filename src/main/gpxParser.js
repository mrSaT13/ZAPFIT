const fs = require('fs');
const path = require('path');
const { DOMParser } = require('xmldom');

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const dPhi = (lat2-lat1) * Math.PI/180;
    const dLambda = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda/2) * Math.sin(dLambda/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseGPXXml(dom) {
    let title = 'Без названия';
    let date = new Date().toISOString();
    let distance = 0, duration = 0, elevationGain = 0;
    const heartRates = [], speeds = [];
    const trkpts = dom.getElementsByTagName('trkpt');
    const points = [];

    const nameNode = dom.getElementsByTagName('name')[0];
    if (nameNode) title = nameNode.textContent;
    const timeNode = dom.getElementsByTagName('time')[0];
    if (timeNode) date = timeNode.textContent;

    const stats = dom.getElementsByTagNameNS('*', 'TrackStatsExtension')[0];
    if (stats) {
        const dist = stats.getElementsByTagNameNS('*', 'Distance')[0];
        const time = stats.getElementsByTagNameNS('*', 'TimerTime')[0] || stats.getElementsByTagNameNS('*', 'MovingTime')[0];
        if (dist) distance = parseFloat(dist.textContent);
        if (time) duration = parseInt(time.textContent);
    }

    let prevEle = null;
    for (let i = 0; i < trkpts.length; i++) {
        const pt = trkpts[i];
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        const eleNode = pt.getElementsByTagName('ele')[0];
        const ele = eleNode ? parseFloat(eleNode.textContent) : null;
        if (prevEle !== null && ele !== null && ele > prevEle) elevationGain += (ele - prevEle);
        prevEle = ele;

        const time = pt.getElementsByTagName('time')[0]?.textContent || null;
        const hr = pt.getElementsByTagNameNS('*', 'hr')[0] ? parseInt(pt.getElementsByTagNameNS('*', 'hr')[0].textContent) : null;
        const spdNode = pt.getElementsByTagNameNS('*', 'speed')[0];
        const speed = spdNode ? parseFloat(spdNode.textContent) : null;
        const cadenceNode = pt.getElementsByTagNameNS('*', 'cad')[0] || pt.getElementsByTagNameNS('*', 'cadence')[0];
        const cadence = cadenceNode ? parseInt(cadenceNode.textContent) : null;

        // store every point but allow consumer to prune
        points.push({ lat, lon, ele, time, hr, cadence, speed });

        if (hr) heartRates.push(hr);
        if (speed) speeds.push(speed);
    }

    if (distance === 0 && trkpts.length > 1) {
        for (let i = 1; i < trkpts.length; i++) {
            distance += calculateDistance(parseFloat(trkpts[i-1].getAttribute('lat')), parseFloat(trkpts[i-1].getAttribute('lon')), parseFloat(trkpts[i].getAttribute('lat')), parseFloat(trkpts[i].getAttribute('lon')));
        }
    }
    if (duration === 0 && trkpts.length > 1) {
        const t1 = trkpts[0].getElementsByTagName('time')[0]?.textContent;
        const t2 = trkpts[trkpts.length-1].getElementsByTagName('time')[0]?.textContent;
        if (t1 && t2) duration = (new Date(t2) - new Date(t1)) / 1000;
    }

    const avgSpeed = speeds.length > 0 ? (speeds.reduce((a,b)=>a+b)/speeds.length)*3.6 : (duration > 0 ? (distance/duration)*3.6 : 0);
    return {
        title, date, distance: parseFloat((distance / 1000).toFixed(2)), duration: Math.round(duration),
        elevation_gain: Math.round(elevationGain), avg_hr: heartRates.length ? Math.round(heartRates.reduce((a,b)=>a+b)/heartRates.length) : 0,
        max_hr: heartRates.length ? Math.max(...heartRates) : 0, avg_speed: parseFloat(avgSpeed.toFixed(1)),
        points: JSON.stringify(points)
    };
}

function parseTCXXml(dom) {
    // TCX structure: Activity/Id, Lap/Track/Trackpoint
    let title = 'TCX Activity';
    let date = new Date().toISOString();
    let distance = 0, duration = 0, elevationGain = 0;
    const heartRates = [], speeds = [];
    const points = [];

    const activityId = dom.getElementsByTagName('Id')[0];
    if (activityId) date = activityId.textContent;

    const trackpoints = dom.getElementsByTagName('Trackpoint');
    for (let i = 0; i < trackpoints.length; i++) {
        const tp = trackpoints[i];
        const time = tp.getElementsByTagName('Time')[0]?.textContent || null;
        const pos = tp.getElementsByTagName('Position')[0];
        const lat = pos ? parseFloat(pos.getElementsByTagName('LatitudeDegrees')[0]?.textContent) : null;
        const lon = pos ? parseFloat(pos.getElementsByTagName('LongitudeDegrees')[0]?.textContent) : null;
        const eleNode = tp.getElementsByTagName('AltitudeMeters')[0];
        const ele = eleNode ? parseFloat(eleNode.textContent) : null;
        const hrNode = tp.getElementsByTagName('HeartRateBpm')[0];
        const hr = hrNode ? parseInt(hrNode.getElementsByTagName('Value')[0].textContent) : null;
        const cadNode = tp.getElementsByTagName('Cadence')[0];
        const cadence = cadNode ? parseInt(cadNode.textContent) : null;
        // Speed may be in Extensions/TPX/Speed
        let speed = null;
        const ext = tp.getElementsByTagName('Extensions')[0];
        if (ext) {
            const speedNode = ext.getElementsByTagName('Speed')[0] || ext.getElementsByTagName('ns3:Speed')[0];
            if (speedNode) speed = parseFloat(speedNode.textContent);
        }

        points.push({ lat, lon, ele, time, hr, cadence, speed });
        if (hr) heartRates.push(hr);
        if (speed) speeds.push(speed);
    }

    // try to compute simple stats
    if (trackpoints.length > 1 && distance === 0) {
        // TCX may not contain distance per point; leave distance 0
    }
    const avgSpeed = speeds.length > 0 ? (speeds.reduce((a,b)=>a+b)/speeds.length)*3.6 : 0;
    return {
        title, date, distance: parseFloat((distance / 1000).toFixed(2)), duration: Math.round(duration),
        elevation_gain: Math.round(elevationGain), avg_hr: heartRates.length ? Math.round(heartRates.reduce((a,b)=>a+b)/heartRates.length) : 0,
        max_hr: heartRates.length ? Math.max(...heartRates) : 0, avg_speed: parseFloat(avgSpeed.toFixed(1)),
        points: JSON.stringify(points)
    };
}

async function parseGPXFile(filePath) {
    return new Promise((resolve, reject) => {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const dom = new DOMParser().parseFromString(fileContent, 'text/xml');
            const ext = path.extname(filePath || '').toLowerCase();
            if (ext === '.tcx') {
                resolve(parseTCXXml(dom));
            } else {
                resolve(parseGPXXml(dom));
            }
        } catch (e) { reject(e); }
    });
}

module.exports = { parseGPXFile };
