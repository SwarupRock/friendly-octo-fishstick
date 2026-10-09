import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Volume2, VolumeX } from 'lucide-react';
import './VideoCarousel.css';

const DEFAULT_VIDEOS = [
  { url: "https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4", poster: "https://framerusercontent.com/images/f9RiWoNpmlCMqVRIHz8l8wYfeI.jpg" },
  { url: "https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4", poster: "https://framerusercontent.com/images/BYnxEV1zjYb9bhWh1IwBZ1ZoS60.jpg" },
  { url: "https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4", poster: "https://framerusercontent.com/images/f9RiWoNpmlCMqVRIHz8l8wYfeI.jpg" },
  { url: "https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4", poster: "https://framerusercontent.com/images/BYnxEV1zjYb9bhWh1IwBZ1ZoS60.jpg" }
];

export default function VideoCarousel({ videos = DEFAULT_VIDEOS }) {
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const count = videos.length;
  const videoRefs = useRef([]);

  // Config matching framer parameters
  const spacing = 180;
  const depth = 260;
  const cardWidth = 320;
  const cardHeight = 560; // vertical/mobile video aspect ratio

  const next = () => setActive((a) => (a + 1) % count);
  const prev = () => setActive((a) => (a - 1 + count) % count);
  const goTo = (i) => setActive(i);

  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        v.muted = muted;
        v.play().catch(e => console.log('Auto-play prevented', e));
      } else {
        v.pause();
        v.muted = true;
      }
    });
  }, [active, muted]);

  return (
    <div className="video-carousel-container">
      <div className="vc-stage" style={{ perspective: '1000px', height: cardHeight + 40 }}>
        {videos.map((vid, i) => {
          const half = Math.floor(count / 2);
          let rel = i - active;
          if (rel > half) rel -= count;
          if (rel < -half) rel += count;
          
          const abs = Math.abs(rel);
          const sign = rel === 0 ? 0 : rel > 0 ? 1 : -1;
          
          const translate = rel * spacing;
          const z = -abs * depth * 0.35;
          const rotate = rel * -18;
          const isActive = rel === 0;

          return (
            <div 
              key={i}
              className={`vc-card ${isActive ? 'active' : ''}`}
              style={{
                width: cardWidth,
                height: cardHeight,
                transform: `translateX(${translate}px) translateZ(${z}px) rotateY(${rotate}deg) scale(${isActive ? 1 : 0.92})`,
                zIndex: 10 - abs,
                opacity: abs > 3 ? 0 : 1 - Math.min(0.75, abs * 0.18),
                filter: `blur(${isActive ? 0 : 4}px)`,
              }}
              onClick={() => { if (!isActive) goTo(i); }}
            >
              <video 
                ref={el => videoRefs.current[i] = el}
                src={vid.url} 
                poster={vid.poster}
                loop 
                playsInline
                className="vc-video"
              />
              {!isActive && (
                <div className="vc-overlay" style={{ background: sign === 0 ? 'transparent' : 'rgba(0,0,0,0.4)' }} />
              )}
              {isActive && (
                <button className="vc-mute-btn" onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}>
                  {muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
                </button>
              )}
            </div>
          );
        })}

        {count > 1 && (
          <>
            <button className="vc-arrow prev" onClick={prev}><ChevronLeft/></button>
            <button className="vc-arrow next" onClick={next}><ChevronRight/></button>
            <div className="vc-dots">
              {videos.map((_, i) => (
                <button 
                  key={i} 
                  className={`vc-dot ${i === active ? 'active' : ''}`} 
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
