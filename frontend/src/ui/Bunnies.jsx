import React, { useEffect, useMemo, useRef, useState } from "react";

function BunniesCore({ count=70, images=[], burstNonce=0, dark=false }) {
  const imagesKey = useMemo(()=>images.join("|"),[images]);

  const base = useMemo(()=>{
    return Array.from({length:count}).map((_,i)=>({
      key:"b"+i,
      left:Math.random()*100,
      size:32+Math.random()*26,
      dur:12+Math.random()*18,
      delay:-Math.random()*20,
      hop:3+Math.random()*6,
      drift:Math.random()<.5?-1:1,
      img:images[(Math.random()*images.length)|0],
    }));
  },[count,imagesKey,images]);

  const [burst,setBurst]=useState([]);
  const t=useRef(null);

  useEffect(()=>{
    if(!burstNonce) return;
    const now=Date.now();
    const arr=Array.from({length:20}).map((_,i)=>({
      key:"x"+now+"-"+i,
      left:Math.random()*100,
      size:40+Math.random()*38,
      dur:6+Math.random()*12,
      delay:-Math.random()*6,
      hop:2+Math.random()*4,
      drift:Math.random()<.5?-1:1,
      img:images[(Math.random()*images.length)|0],
    }));
    setBurst(arr);
    clearTimeout(t.current);
    t.current=setTimeout(()=>setBurst([]),4000);
    return()=>clearTimeout(t.current);
  },[burstNonce,images]);

  const all = useMemo(()=>[...base,...burst],[base,burst]);

  return (
    <div className={`bunnies ${dark?"bunnies-dark":""}`} aria-hidden="true">
      {all.map(b=>(
        <div key={b.key} className={b.key[0]==="x"?"bunny bunny-burst":"bunny"}
          style={{
            "--left":`${b.left}%`,
            "--size":`${b.size}px`,
            "--dur":`${b.dur}s`,
            "--delay":`${b.delay}s`,
            "--hop":`${b.hop}s`,
            "--drift":b.drift,
            backgroundImage:`url(${b.img})`,
          }}
        />
      ))}
    </div>
  );
}

export default React.memo(BunniesCore);
