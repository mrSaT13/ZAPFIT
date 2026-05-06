import React from 'react';
import './TitleBar.css';

export default function TitleBar() {
  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();
  const handleClose = () => window.electronAPI?.closeWindow?.();

  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <div className="app-icon" />
        <div className="title-text">ZAPFIT</div>
      </div>
      <div className="title-bar-controls">
        <button aria-label="Minimize" onClick={handleMinimize} className="tb-btn tb-min">—</button>
        <button aria-label="Maximize" onClick={handleMaximize} className="tb-btn tb-max">▢</button>
        <button aria-label="Close" onClick={handleClose} className="tb-btn tb-close">✕</button>
      </div>
    </div>
  );
}
