import { readVideoTimeline, removeVideoSection } from '../src/utils/videoTrim.ts';
// Run with Vite; real browser codecs are not available in the Node CI job.
import { Input, BlobSource, MP4, WEBM, VideoSampleSink, AudioSampleSink, Conversion, Output, Mp4OutputFormat, BufferTarget } from 'mediabunny';

const file = new File([await (await fetch('/veilpix/scripts/fixtures/video-cut.mp4')).blob()], 'frame-test.mp4', {type:'video/mp4'});
const open = blob => new Input({source:new BlobSource(blob),formats:[MP4,WEBM]});
async function pixels(blob, times) {
  const input=open(blob); const sink=new VideoSampleSink(await input.getPrimaryVideoTrack());
  const canvas=new OffscreenCanvas(80,48), ctx=canvas.getContext('2d'); const results=[];
  try { for (const time of times) { const sample=await sink.getSample(time); sample.draw(ctx,0,0,80,48); results.push([...ctx.getImageData(0,0,80,48).data]); sample.close(); } return results; }
  finally {input.dispose();}
}
async function audio(blob) {
 const input=open(blob); const sink=new AudioSampleSink(await input.getPrimaryAudioTrack());const samples=[];
 try {for await(const sample of sink.samples()) {const data=new Float32Array(sample.numberOfFrames);sample.copyTo(data,{planeIndex:0,format:'f32-planar'});samples.push({time:sample.timestamp,data});sample.close();}return samples;}finally{input.dispose();}
}
async function check(source, range, label) {
 const timeline=await readVideoTimeline(source);const cut=await removeVideoSection(source,timeline,range);
 const kept=timeline.boundaries.slice(0,-1).map((time,index)=>({time,index})).filter(({index})=>index<range.start||index>=range.end);
 const removedDuration=timeline.boundaries[range.end]-timeline.boundaries[range.start];
 if(cut.timeline.boundaries.length-1!==kept.length)throw new Error(label+' wrong frame count');
 kept.forEach((frame,i)=>{
   const expected=frame.time-timeline.boundaries[0]-(frame.index>=range.end?removedDuration:0);
   if(Math.abs(cut.timeline.boundaries[i]-expected)>0.000002)throw new Error(label+' frame timestamp mismatch at '+i);
 });
 const indexes=[...new Set([0,Math.max(0,range.start-1),Math.min(kept.length-1,range.start),kept.length-1])];
 const sourcePixels=await pixels(source,indexes.map(index=>kept[index].time+0.005));
 const outputPixels=await pixels(cut.blob,indexes.map(index=>cut.timeline.boundaries[index]+0.005));
 const mse=sourcePixels.map((data,index)=>data.reduce((sum,v,i)=>sum+(v-outputPixels[index][i])**2,0)/data.length);
 if(Math.max(...mse)>100)throw new Error(label+' frame mismatch '+JSON.stringify(mse));
 const input=open(cut.blob);let containerDuration; try{containerDuration=await input.computeDuration();}finally{input.dispose();}
 if(Math.abs(containerDuration-cut.duration)>0.0011)throw new Error(label+' container duration '+containerDuration+' vs '+cut.duration);
 const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(cut.blob);
 await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error(label+' playback metadata timeout')),10000);
   video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error(label+' playback failed'));};
 });
 const browserDuration=video.duration;URL.revokeObjectURL(video.src);video.removeAttribute('src');video.load();
 if(Math.abs(browserDuration-cut.duration)>0.002)throw new Error(label+' browser duration mismatch '+browserDuration);
 return {cut,report:{label,frames:cut.timeline.boundaries.length-1,duration:cut.duration,containerDuration,browserDuration,mse}};
}
const button = document.querySelector('button');
const setReport = text => document.querySelector('pre').textContent = text;
button.onclick = async()=>{button.disabled=true;try{setReport('Running browser encoder tests…');const reports=[];
 const center=await check(file,{start:13,end:61},'center non-keyframe cut');reports.push(center.report);
 for(const[range,label]of [[{start:0,end:13},'beginning'],[{start:61,end:96},'end'],[{start:45,end:46},'single-frame'],[{start:0,end:95},'keep one frame']]){setReport(JSON.stringify(reports,null,2)+'\nRunning '+label);try {reports.push((await check(file,range,label)).report);}catch(e){throw new Error(label+' '+e.message+' cause '+e.cause?.message);}}
 const vfr = new File([await (await fetch('/veilpix/scripts/fixtures/video-cut-vfr.mp4')).blob()], 'vfr.mp4', {type:'video/mp4'});
 reports.push((await check(vfr,{start:9,end:39},'variable frame rate')).report);
 const silentInput=open(file),silentOutput=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
 try {
   const conversion=await Conversion.init({input:silentInput,output:silentOutput,copy:{mode:'forced'},audio:{discard:true}});
   await conversion.execute();
   reports.push((await check(new File([silentOutput.target.buffer],'silent.mp4',{type:'video/mp4'}),{start:13,end:61},'silent video')).report);
 } finally {silentInput.dispose();}
 reports.push((await check(new File([center.cut.blob],'second.mp4',{type:center.cut.blob.type}),{start:4,end:20},'second center cut')).report);
 const before=await audio(file),after=await audio(center.cut.blob);
 const flat=chunks=>{const result=new Float32Array(Math.ceil(Math.max(...chunks.map(c=>c.time+c.data.length/48000))*48000));for(const c of chunks){const start=Math.round(c.time*48000);for(let i=Math.max(0,-start);i<c.data.length;i++)if(start+i<result.length)result[start+i]=c.data[i];}return result;};
 const original=flat(before),edited=flat(after);const correlations=[];
 for(const time of [0.1,0.7,1.5]){const sourceTime=time<13/24?time:time+2;let dot=0,a=0,b=0;for(let i=0;i<2400;i++){const x=original[Math.round(sourceTime*48000)+i],y=edited[Math.round(time*48000)+i];dot+=x*y;a+=x*x;b+=y*y;}correlations.push(dot/Math.sqrt(a*b));}
 if(correlations.some(x=>!Number.isFinite(x)||x<0.97))throw new Error('Audio join failed '+JSON.stringify(correlations));
 setReport(JSON.stringify({status:'PASS',reports,audioCorrelations:correlations},null,2));
 }catch(error){setReport('FAIL '+error.stack);}finally{button.disabled=false;}};
