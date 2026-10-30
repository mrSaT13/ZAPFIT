(async ()=>{
  try{
    const m = await import('jimp');
    console.log('module keys:', Object.keys(m));
    console.log('default keys:', Object.keys(m.default || {}));
    console.log('typeof default.read:', typeof (m.default && m.default.read));
  }catch(e){ console.error('inspect error', e); process.exit(1);} 
})();
