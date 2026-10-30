import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, Map as MapIcon, Zap, Heart, TrendingUp, Info, Gauge, Flame, Droplet, AlertCircle, Sparkles, Target, Mountain, Wind, Upload, MessageSquare, Image as ImageIcon } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import SecureImage from './SecureImage';

const RideModal = ({ ride, onClose, theme }) => {
    if (!ride) return null;

    const [similarRides, setSimilarRides] = useState([]);
    const [comparison, setComparison] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [photos, setPhotos] = useState([]);
    const [serverMedia, setServerMedia] = useState([]);
    const [comments, setComments] = useState('');
    const [editComments, setEditComments] = useState(false);
    const [newComments, setNewComments] = useState('');
    const mapRef = useRef(null);
    const fileInputRef = useRef(null);

    // Parse GPS points
    let points = [];
    try {
        points = ride.points ? JSON.parse(ride.points) : [];
    } catch (e) {
        console.error("Failed to parse map points", e);
    }

    // Load similar rides for ML analysis
    useEffect(() => {
        const fetchSimilar = async () => {
            try {
                const result = await window.electronAPI.findSimilarActivities(ride.id);
                if (result.success) {
                    setSimilarRides(result.similar || []);
                    setComparison(result.comparison || {});
                }
            } catch (e) {
                console.error('Failed to load similar activities', e);
            }
            setLoading(false);
        };
        
        // Load photos and comments from ride object
        const loadPhotosAndComments = async () => {
            try {
                console.log('Loading photos and comments:', { photos: ride.photos, comments: ride.comments });
                
                // Load photos
                if (ride.photos && ride.photos.trim()) {
                    try {
                        const parsedPhotos = JSON.parse(ride.photos);
                        if (Array.isArray(parsedPhotos)) {
                            setPhotos(parsedPhotos);
                        } else {
                            setPhotos([]);
                        }
                    } catch (parseErr) {
                        console.warn('Failed to parse photos JSON:', parseErr);
                        setPhotos([]);
                    }
                } else {
                    setPhotos([]);
                }
                
                // Load comments
                if (ride.comments) {
                    setComments(ride.comments);
                    setNewComments(ride.comments);
                } else {
                    setComments('');
                    setNewComments('');
                }
            } catch (e) {
                console.error('Failed to load photos/comments', e);
                setPhotos([]);
                setComments('');
                setNewComments('');
            }
        };
        
        fetchSimilar();
        loadPhotosAndComments();
        // Load server media if backed by server
        if (ride.server_id && window.electronAPI?.endurainGetActivityMedia) {
            window.electronAPI.endurainGetActivityMedia(ride.server_id).then(r => {
                if (r?.success && r.media) setServerMedia(r.media);
            }).catch(()=>{});
        }
    }, [ride]);

    // Generate dynamic trainer notes based on ML analysis
    const generateTrainerNotes = () => {
        if (!comparison || comparison.count === 0) {
            return generateBasicNotes();
        }

        const speedDiff = ride.avg_speed - comparison.avgSpeed;
        const speedPercent = ((speedDiff / comparison.avgSpeed) * 100).toFixed(1);
        const tssPercent = ride.tss ? ((ride.tss / comparison.avgTSS) * 100).toFixed(0) : '0';
        const hrPercent = ride.avg_hr ? ((ride.avg_hr / comparison.avgHR) * 100).toFixed(0) : '0';

        let notes = [];

        if (speedDiff > 0.5) {
            notes.push(`Обратите внимание: сегодня вы проехали быстрее обычного на ${speedPercent}%! Хорошая форма.`);
        } else if (speedDiff < -0.5) {
            notes.push(`Сегодня медленнее, чем обычно на ${Math.abs(speedPercent)}%. Возможно, усталость или ветер.`);
        }

        if (ride.tss) {
            if (tssPercent > 120) {
                notes.push(`Мегатяжёлая сессия! ${tssPercent}% от вашего обычного для таких трасс. Восстановление критично.`);
            } else if (tssPercent < 80) {
                notes.push(`Лёгкая активность. Хороша для восстановления между интенсивными днями.`);
            }
        }

        if (ride.avg_hr && comparison.avgHR) {
            if (hrPercent > 110) {
                notes.push(`Пульс выше обычного на ${(hrPercent - 100).toFixed(0)}%. Проверьте восстановление.`);
            } else if (hrPercent < 90) {
                notes.push(`Эффективная работа — пульс ниже обычного. Экономичная техника.`);
            }
        }

        if (comparison.fastestRide) {
            const speedDiffBest = ride.avg_speed - comparison.fastestRide.avg_speed;
            if (speedDiffBest > 0) {
                notes.push(`Личный рекорд на этой дистанции! Быстрее, чем ${new Date(comparison.fastestRide.date).toLocaleDateString('ru-RU')}`);
            }
        }

        if (notes.length === 0) {
            return generateBasicNotes();
        }

        return notes.join('\n');
    };

    const generateBasicNotes = () => {
        if (ride.tss > 150) {
            return "Чудовищная нагрузка! VO2max сессия. Срочно восполните гликоген и отдохните 48 часов.";
        } else if (ride.tss > 80) {
            return "Развивающая сессия. Хорошая работа! Завтра лучше восстановительный заезд.";
        } else if (ride.type === 'Run') {
            return "Хорошая беговая работа. Обратите внимание на каденс и технику.";
        } else {
            return "Восстановительная активность для поддержания тонуса.";
        }
    };

    // Render interactive Leaflet map
    const renderLeafletMap = () => {
        if (points.length < 2) {
            return (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-slate-900 rounded-3xl border border-white/5">
                    <MapIcon size={48} className="mb-2 opacity-20" />
                    <p className="text-sm">GPS данные отсутствуют</p>
                </div>
            );
        }

        const startPoint = [points[0].lat, points[0].lon];
        const endPoint = [points[points.length - 1].lat, points[points.length - 1].lon];
        const latLngs = points.map(p => [p.lat, p.lon]);

        return (
            <MapContainer
                center={startPoint}
                zoom={12}
                style={{ height: '100%', width: '100%', borderRadius: '1.5rem' }}
                className="rounded-3xl"
                ref={mapRef}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                />
                <Polyline
                    positions={latLngs}
                    color="#6366f1"
                    weight={3}
                    opacity={0.8}
                    dashArray="5,10"
                />
                <Marker position={startPoint} icon={L.icon({
                    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2322c55e" width="32" height="32"><circle cx="12" cy="12" r="10"/></svg>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })}>
                    <Popup>Старт</Popup>
                </Marker>
                <Marker position={endPoint} icon={L.icon({
                    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ef4444" width="32" height="32"><circle cx="12" cy="12" r="10"/></svg>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })}>
                    <Popup>Финиш</Popup>
                </Marker>
            </MapContainer>
        );
    };

    const handlePhotoUpload = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
            console.log('No files selected');
            return;
        }
        
        console.log('Starting photo upload:', files.length, 'files');
        const fileCount = files.length;
        let loadedCount = 0;
        const newPhotos = [...photos];
        
        const processFile = (file, index) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    console.log('File loaded:', file.name);
                    newPhotos.push(e.target.result);
                    loadedCount++;
                    
                    if (loadedCount === fileCount) {
                        console.log('All files loaded. Updating state with', newPhotos.length, 'photos');
                        setPhotos([...newPhotos]); // Force new array reference
                        
                        // Save to database
                        (async () => {
                            try {
                                const result = await window.electronAPI.updateActivityPhotos(ride.id, newPhotos);
                                console.log('updateActivityPhotos result:', result);
                                if (!result || !result.success) {
                                    console.error('Failed to save photos:', result?.error);
                                    alert('Ошибка при сохранении фото: ' + (result?.error || 'Unknown error'));
                                } else {
                                    alert(newPhotos.length + ' фото сохранено');
                                }
                            } catch (err) {
                                console.error('Photo upload error:', err);
                                alert('Ошибка при загрузке фото: ' + err.message);
                            }
                        })();
                    }
                    resolve();
                };
                reader.onerror = () => {
                    console.error('Failed to read file:', file.name);
                    loadedCount++;
                    resolve();
                };
                reader.readAsDataURL(file);
            });
        };
        
        // Process all files
        for (let i = 0; i < fileCount; i++) {
            await processFile(files[i], i);
        }
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removePhoto = async (index) => {
        const updatedPhotos = photos.filter((_, i) => i !== index);
        setPhotos(updatedPhotos);
        await window.electronAPI.updateActivityPhotos(ride.id, updatedPhotos);
    };

    const saveComments = async () => {
        try {
            console.log('Saving comments for ride:', ride.id, 'length:', newComments.length);
            const result = await window.electronAPI.updateActivityComments(ride.id, newComments);
            console.log('updateActivityComments result:', result);
            if (result && result.success) {
                setComments(newComments);
                setEditComments(false);
                alert('Комментарий сохранен');
            } else {
                console.error('Failed to save comments:', result?.error);
                alert('Ошибка при сохранении комментария: ' + (result?.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Comment save error:', err);
            alert('Ошибка при сохранении: ' + err.message);
        }
    };

    const TabContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Дистанция</div>
                                <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{(ride.distance || 0).toFixed(2)} км</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Время</div>
                                <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{Math.floor((ride.duration || 0) / 3600)}ч {Math.floor(((ride.duration || 0) % 3600) / 60)}м</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Подъем</div>
                                <div className="font-bold text-emerald-400">{Math.round(ride.elevation_gain || 0)} м</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">TSS</div>
                                <div className="font-bold text-orange-400">{Math.round(ride.tss || 0)}</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Ср. скорость</div>
                                <div className="font-bold text-blue-400">{(ride.avg_speed || 0).toFixed(1)} км/ч</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Макс. скорость</div>
                                <div className="font-bold text-blue-400">{(ride.max_speed || 0).toFixed(1)} км/ч</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex justify-between text-sm">
                                <span className="text-gray-400">Ср. пульс</span>
                                <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{ride.avg_hr ? `${ride.avg_hr} bpm` : '—'}</span>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex justify-between text-sm">
                                <span className="text-gray-400">Макс. пульс</span>
                                <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{ride.max_hr ? `${ride.max_hr} bpm` : '—'}</span>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex justify-between text-sm">
                                <span className="text-gray-400">Ср. мощность</span>
                                <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{ride.avg_power ? `${Math.round(ride.avg_power)} W` : '—'}</span>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex justify-between text-sm">
                                <span className="text-gray-400">Сложность RPE</span>
                                <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{ride.rpe ? `${ride.rpe}/10` : '—'}</span>
                            </div>
                        </div>
                    </div>
                );
            case 'elevation':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Набор высоты</div>
                                <div className="font-bold text-emerald-400">{Math.round(ride.ascent || ride.elevation_gain || 0)} м</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Спуск</div>
                                <div className="font-bold text-red-400">{Math.round(ride.descent || 0)} м</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Мин. высота</div>
                                <div className="font-bold text-blue-400">{Math.round(ride.min_elevation || 0)} м</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Макс. высота</div>
                                <div className="font-bold text-blue-400">{Math.round(ride.max_elevation || 0)} м</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm col-span-2">
                                <div className="text-gray-500 text-xs mb-1">Ср. уклон / Макс. уклон</div>
                                <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{(ride.avg_gradient || 0).toFixed(1)}% / {(ride.max_gradient || 0).toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                );
            case 'dynamics':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Макс. скорость</div>
                                <div className="font-bold text-blue-400">{(ride.max_speed || 0).toFixed(1)} км/ч</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Медиана скорости</div>
                                <div className="font-bold text-blue-400">{(ride.median_speed || 0).toFixed(1)} км/ч</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm col-span-2">
                                <div className="text-gray-500 text-xs mb-1">Стд. отклонение скорости</div>
                                <div className="font-bold text-purple-400">{(ride.speed_stddev || 0).toFixed(1)} км/ч</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Время в движении</div>
                                <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{Math.floor((ride.moving_time || 0) / 60)} мин</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Остановки</div>
                                <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{Math.floor((ride.stopped_time || 0) / 60)} мин</div>
                            </div>
                        </div>
                    </div>
                );
            case 'quality':
                return (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Точек GPS</div>
                                <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{ride.num_points || 0} шт.</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                <div className="text-gray-500 text-xs mb-1">Сегментов трека</div>
                                <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{ride.track_segments || 1}</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm col-span-2">
                                <div className="text-gray-500 text-xs mb-1">Точность GPS (ср.)</div>
                                <div className="font-bold text-cyan-400">{(ride.gps_accuracy || 0).toFixed(1)} м</div>
                            </div>
                        </div>
                    </div>
                );
            case 'photos':
                return (
                    <div className="space-y-4">
                        <div className="flex gap-2 mb-4">
                            <input 
                                type="file" 
                                multiple 
                                accept="image/*" 
                                onChange={handlePhotoUpload}
                                ref={fileInputRef}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-xl transition-all border border-blue-500/30"
                            >
                                <Upload size={16} />
                                Загрузить фото
                            </button>
                            <span className="text-xs text-gray-400 py-2">
                                {photos.length + serverMedia.length} {photos.length + serverMedia.length === 1 ? 'фото' : 'фото'}
                            </span>
                        </div>
                        {/* Server thumbnail */}
                        {ride.map_thumbnail_path && (
                            <div className="mb-3">
                                <div className="text-xs text-gray-500 mb-1">Миниатюра маршрута с сервера</div>
                                <SecureImage src={ride.map_thumbnail_path} alt="thumbnail" className="w-full h-40 object-cover rounded-xl border border-white/5" />
                            </div>
                        )}
                        {/* Server media */}
                        {serverMedia.length > 0 && (
                            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto mb-3">
                                {serverMedia.map((m, idx) => {
                                    const src = m.file_path || m.path || m.image_path || m.url;
                                    return (
                                        <div key={`srv-${m.id||idx}`} className="relative rounded-xl overflow-hidden border border-white/5">
                                            <SecureImage src={src} alt={`Server media ${idx+1}`} className="w-full h-40 object-cover" />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {photos.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                                {photos.map((photo, idx) => (
                                    <div key={idx} className="relative rounded-xl overflow-hidden group border border-white/5">
                                        <img src={photo} alt={`Photo ${idx + 1}`} className="w-full h-40 object-cover" />
                                        <button
                                            onClick={() => removePhoto(idx)}
                                            className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : serverMedia.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                <ImageIcon size={40} className="mx-auto mb-2 opacity-50" />
                                <p>Нет фото. Загрузите фотографии активности.</p>
                            </div>
                        )}
                    </div>
                );
            case 'comments':
                return (
                    <div className="space-y-4">
                        {editComments ? (
                            <div className="space-y-3">
                                <textarea
                                    value={newComments}
                                    onChange={(e) => setNewComments(e.target.value)}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        // Prevent Escape from closing modal while in textarea
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                        }
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClickCapture={(e) => e.stopPropagation()}
                                    onContextMenu={(e) => e.stopPropagation()}
                                    className={`w-full h-32 p-3 border rounded-xl focus:outline-none focus:border-indigo-500/50 ${theme === 'dark' ? 'bg-white/5 border-white/5 text-white placeholder-gray-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                                    placeholder="Добавьте комментарий к тренировке..."
                                    autoFocus
                                    spellCheck="false"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={saveComments}
                                        className="px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-xl transition-all border border-green-500/30"
                                    >
                                        Сохранить
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditComments(false);
                                            setNewComments(comments);
                                        }}
                                        className="px-4 py-2 bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 rounded-xl transition-all border border-gray-500/30"
                                    >
                                        Отмена
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {comments ? (
                                    <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                                        <p className={`${theme === 'dark' ? 'text-white' : 'text-slate-900'} whitespace-pre-line`}>{comments}</p>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-gray-400">
                                        <MessageSquare size={40} className="mx-auto mb-2 opacity-50" />
                                        <p>Комментариев нет</p>
                                    </div>
                                )}
                                <button
                                    onClick={() => setEditComments(true)}
                                    className="w-full px-4 py-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-xl transition-all border border-indigo-500/30"
                                >
                                    {comments ? 'Редактировать' : 'Добавить комментарий'}
                                </button>
                            </div>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto"
             onKeyDown={(e) => {
                 // Don't handle keyboard if focused on textarea
                 if (document.activeElement?.tagName === 'TEXTAREA') {
                     return;
                 }
                 if (e.key === 'Escape') {
                     onClose();
                 }
             }}
             onMouseDown={(e) => {
                 // Don't bubble mouse events from textarea
                 if (e.target?.tagName !== 'TEXTAREA') {
                     e.stopPropagation();
                 }
             }}
        >
            <div className={`relative w-full max-w-6xl my-auto rounded-[2.5rem] border shadow-2xl flex flex-col ${
                theme === 'dark' ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'
            }`}
                 onClick={(e) => {
                     // Allow clicks in textarea
                     if (e.target?.tagName === 'TEXTAREA') {
                         return;
                     }
                     e.stopPropagation();
                 }}
            >
                {/* Header */}
                <div className="p-8 pb-4 flex justify-between items-start border-b border-white/5">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20">
                                {ride.type || 'Ride'} 
                            </span>
                            <div className="flex items-center text-gray-500 text-sm">
                                <Calendar size={14} className="mr-1.5" />
                                {new Date(ride.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                        </div>
                        <h2 className={`text-3xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{ride.title || 'Активность без названия'}</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className={`p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400 transition-all border border-white/5 ${theme === 'dark' ? 'hover:text-white' : 'hover:text-slate-900'}`}
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* Map */}
                    <div className="h-[350px] rounded-3xl overflow-hidden border border-white/5">
                        {renderLeafletMap()}
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {[
                            { id: 'overview', label: 'Основные', icon: <Gauge size={14} /> },
                            { id: 'elevation', label: 'Высоты', icon: <Mountain size={14} /> },
                            { id: 'dynamics', label: 'Динамика', icon: <Zap size={14} /> },
                            { id: 'quality', label: 'Качество', icon: <Target size={14} /> },
                            { id: 'photos', label: 'Фото', icon: <ImageIcon size={14} /> },
                            { id: 'comments', label: 'Комментарии', icon: <MessageSquare size={14} /> },
                        ].map(tab => {
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl whitespace-nowrap transition-all text-sm font-bold ${
                                        activeTab === tab.id
                                            ? 'bg-indigo-500 text-white'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tab Content */}
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-6">
                        <TabContent />
                    </div>

                    {/* AI Trainer Analysis */}
                    <div className="p-6 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-3xl">
                        <h4 className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase mb-4">
                            <Sparkles size={16}/> AI-Тренер: Анализ сессии
                        </h4>
                        <p className={`text-sm leading-relaxed whitespace-pre-line font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-slate-600'}`}>
                            {generateTrainerNotes()}
                        </p>
                        {!loading && comparison && comparison.count > 0 && (
                            <div className="mt-4 pt-4 border-t border-indigo-500/20 grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-gray-400">Похожих трасс:</span>
                                    <div className="font-bold text-indigo-300">{comparison.count}</div>
                                </div>
                                <div>
                                    <span className="text-gray-400">Ср. скорость:</span>
                                    <div className="font-bold text-indigo-300">{comparison.avgSpeed?.toFixed(1)} км/ч</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Similar Rides Comparison */}
                    {!loading && similarRides.length > 0 && (
                        <div className="space-y-4">
                            <h4 className={`flex items-center gap-2 font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                                <Target size={18} className="text-green-400"/> История похожих тренировок
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {similarRides.slice(0, 5).map((r, i) => (
                                    <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-3 text-sm">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{new Date(r.date).toLocaleDateString('ru-RU')}</span>
                                            <span className={`text-xs px-2 py-1 rounded ${r.avg_speed > (comparison?.avgSpeed || 0) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {r.avg_speed?.toFixed(1)} км/ч
                                            </span>
                                        </div>
                                        <div className="text-gray-400">
                                            {r.distance?.toFixed(1)} км • {Math.floor(r.duration/3600)}h {Math.floor((r.duration%3600)/60)}m • TSS: {Math.round(r.tss || 0)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RideModal;