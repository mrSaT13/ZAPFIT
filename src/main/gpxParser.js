const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

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
    let movingTime = 0, stoppedTime = 0, maxSpeed = 0;
    const heartRates = [], speeds = [];
    const trkpts = dom.getElementsByTagName('trkpt');
    const points = [];

    const nameNode = dom.getElementsByTagName('name')[0];
    if (nameNode) title = nameNode.textContent;
    const timeNode = dom.getElementsByTagName('time')[0];
    if (timeNode) date = timeNode.textContent;

    // Parse TrackStatsExtension (OpenTracks format)
    const stats = dom.getElementsByTagNameNS('*', 'TrackStatsExtension')[0];
    if (stats) {
        const dist = stats.getElementsByTagNameNS('*', 'Distance')[0];
        const timerTime = stats.getElementsByTagNameNS('*', 'TimerTime')[0];
        const moveTime = stats.getElementsByTagNameNS('*', 'MovingTime')[0];
        const stopTime = stats.getElementsByTagNameNS('*', 'StoppedTime')[0];
        const maxSpd = stats.getElementsByTagNameNS('*', 'MaxSpeed')[0];
        
        if (dist) distance = parseFloat(dist.textContent);
        if (timerTime) duration = parseInt(timerTime.textContent);
        if (moveTime) movingTime = parseInt(moveTime.textContent);
        if (stopTime) stoppedTime = parseInt(stopTime.textContent);
        if (maxSpd) maxSpeed = parseFloat(maxSpd.textContent);
    }

    // Parse elevation and speed from track points
    let prevEle = null;
    let elevations = [];
    let elevationDifferences = [];
    let distances = [];
    
    for (let i = 0; i < trkpts.length; i++) {
        const pt = trkpts[i];
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        const eleNode = pt.getElementsByTagName('ele')[0];
        const ele = eleNode ? parseFloat(eleNode.textContent) : null;
        
        if (ele !== null) elevations.push(ele);
        
        // Calculate elevation gain (ascent)
        if (prevEle !== null && ele !== null) {
            const eleDiff = ele - prevEle;
            elevationDifferences.push(eleDiff);
            if (eleDiff > 0) elevationGain += eleDiff;
        }
        prevEle = ele;

        const time = pt.getElementsByTagName('time')[0]?.textContent || null;
        const hr = pt.getElementsByTagNameNS('*', 'hr')[0] ? parseInt(pt.getElementsByTagNameNS('*', 'hr')[0].textContent) : null;
        const spdNode = pt.getElementsByTagNameNS('*', 'speed')[0];
        const speed = spdNode ? parseFloat(spdNode.textContent) : null;  // м/с
        const cadenceNode = pt.getElementsByTagNameNS('*', 'cad')[0] || pt.getElementsByTagNameNS('*', 'cadence')[0];
        const cadence = cadenceNode ? parseInt(cadenceNode.textContent) : null;
        
        // Parse GPS accuracy (OpenTracks)
        const accuracyNode = pt.getElementsByTagNameNS('*', 'accuracy_horizontal')[0];
        const accuracy = accuracyNode ? parseFloat(accuracyNode.textContent) : null;

        points.push({ lat, lon, ele, time, hr, cadence, speed: speed ? speed * 3.6 : null, accuracy });

        if (hr) heartRates.push(hr);
        if (speed) speeds.push(speed);  // В м/с для расчёта
    }

    // Compute distance if not provided
    if (distance === 0 && trkpts.length > 1) {
        for (let i = 1; i < trkpts.length; i++) {
            const d = calculateDistance(
                parseFloat(trkpts[i-1].getAttribute('lat')),
                parseFloat(trkpts[i-1].getAttribute('lon')),
                parseFloat(trkpts[i].getAttribute('lat')),
                parseFloat(trkpts[i].getAttribute('lon'))
            );
            distance += d;
            distances.push(d);
        }
    } else if (trkpts.length > 1) {
        // Pre-computed distance, but still track segments for gradient calculation
        for (let i = 1; i < trkpts.length; i++) {
            const d = calculateDistance(
                parseFloat(trkpts[i-1].getAttribute('lat')),
                parseFloat(trkpts[i-1].getAttribute('lon')),
                parseFloat(trkpts[i].getAttribute('lat')),
                parseFloat(trkpts[i].getAttribute('lon'))
            );
            distances.push(d);
        }
    }
    
    // Compute duration if not provided
    if (duration === 0 && trkpts.length > 1) {
        const t1 = trkpts[0].getElementsByTagName('time')[0]?.textContent;
        const t2 = trkpts[trkpts.length-1].getElementsByTagName('time')[0]?.textContent;
        if (t1 && t2) duration = Math.round((new Date(t2) - new Date(t1)) / 1000);
    }

    const avgSpeed = speeds.length > 0 ? (speeds.reduce((a,b)=>a+b)/speeds.length)*3.6 : (duration > 0 ? (distance/duration)*3.6 : 0);
    
    // Calculate descent
    let descent = 0;
    for (const diff of elevationDifferences) {
        if (diff < 0) descent += Math.abs(diff);
    }
    
    // Min/max elevation
    const minEle = elevations.length > 0 ? Math.min(...elevations) : null;
    const maxEle = elevations.length > 0 ? Math.max(...elevations) : null;
    
    // Average and max gradient
    let avgGradient = 0;
    let maxGradient = 0;
    for (let i = 0; i < elevationDifferences.length; i++) {
        if (distances[i] > 0) {
            const gradient = (elevationDifferences[i] / distances[i]) * 100;
            avgGradient += gradient;
            maxGradient = Math.max(maxGradient, Math.abs(gradient));
        }
    }
    if (elevationDifferences.length > 0) avgGradient /= elevationDifferences.length;
    
    // Median and stddev of speeds
    let medianSpeed = 0;
    let speedStddev = 0;
    if (speeds.length > 0) {
        const sortedSpeeds = [...speeds].sort((a, b) => a - b);
        medianSpeed = sortedSpeeds[Math.floor(sortedSpeeds.length / 2)];
        const mean = speeds.reduce((a,b)=>a+b) / speeds.length;
        const sqDiffs = speeds.map(s => Math.pow(s - mean, 2));
        speedStddev = Math.sqrt(sqDiffs.reduce((a,b)=>a+b) / speeds.length);
    }
    
    // Average GPS accuracy
    const accuracies = points.filter(p => p.accuracy !== null).map(p => p.accuracy);
    const avgAccuracy = accuracies.length > 0 ? accuracies.reduce((a,b)=>a+b)/accuracies.length : null;
    
    // Count track segments
    const segments = dom.getElementsByTagName('trkseg');
    const trackSegments = segments.length;
    
    return {
        title, date, 
        distance: parseFloat((distance / 1000).toFixed(2)), 
        duration: Math.round(duration),
        elevation_gain: Math.round(elevationGain), 
        avg_hr: heartRates.length ? Math.round(heartRates.reduce((a,b)=>a+b)/heartRates.length) : 0,
        max_hr: heartRates.length ? Math.max(...heartRates) : 0, 
        avg_speed: parseFloat(avgSpeed.toFixed(1)),
        points: JSON.stringify(points),
        // Extended metrics
        moving_time: movingTime,
        stopped_time: stoppedTime,
        max_speed: parseFloat((maxSpeed * 3.6).toFixed(1)),
        ascent: Math.round(elevationGain),
        descent: Math.round(descent),
        min_elevation: minEle,
        max_elevation: maxEle,
        avg_gradient: parseFloat(avgGradient.toFixed(2)),
        max_gradient: parseFloat(maxGradient.toFixed(2)),
        gps_accuracy: avgAccuracy ? parseFloat(avgAccuracy.toFixed(1)) : null,
        track_segments: trackSegments,
        num_points: trkpts.length,
        median_speed: parseFloat((medianSpeed * 3.6).toFixed(1)),
        speed_stddev: parseFloat((speedStddev * 3.6).toFixed(1))
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
