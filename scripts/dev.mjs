import {spawn} from 'node:child_process';
const children=['dev:server','dev:ui'].map(s=>spawn('npm',['run',s],{stdio:'inherit'}));let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');}
for(const c of children)c.on('exit',stop);process.on('SIGINT',stop);process.on('SIGTERM',stop);
