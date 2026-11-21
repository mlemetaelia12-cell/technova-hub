import {createQrMatrix} from './qr';

function safeText(value:string){return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();}
function pdfString(value:string){return safeText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function color(r:number,g:number,b:number){return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;}
function makeContent(input:{learnerName:string;pathTitle:string;pathLevel:string;issuedAt:string;code:string;verifyUrl:string}){
 const W=842,H=595;const c:string[]=[];
 const rect=(x:number,top:number,w:number,h:number,fill:string,stroke?:string,lineWidth=1)=>{const y=H-top-h;c.push('q',`${fill} rg`,`${x} ${y} ${w} ${h} re f`);if(stroke)c.push(`${lineWidth} w`,`${stroke} RG`,`${x} ${y} ${w} ${h} re S`);c.push('Q');};
 const line=(x1:number,t1:number,x2:number,t2:number,stroke:string,width=1)=>{c.push('q',`${width} w`,`${stroke} RG`,`${x1} ${H-t1} m ${x2} ${H-t2} l S`,'Q');};
 const txt=(text:string,x:number,top:number,size:number,font='F1',fill='0.08 0.10 0.19',align:'left'|'center'='left')=>{const safe=pdfString(text);const approx=safe.length*size*(font==='F2'?0.55:0.50);const px=align==='center'?x-approx/2:x;const y=H-top-size;c.push('q',`${fill} rg`,'BT',`/${font} ${size} Tf`,`1 0 0 1 ${px.toFixed(2)} ${y.toFixed(2)} Tm`,`(${safe}) Tj`,'ET','Q');};
 const circle=(cx:number,topCenter:number,r:number,fill:string)=>{const cy=H-topCenter;const k=0.5522847498*r; c.push('q',`${fill} rg`,`${cx+r} ${cy} m`,`${cx+r} ${cy+k} ${cx+k} ${cy+r} ${cx} ${cy+r} c`,`${cx-k} ${cy+r} ${cx-r} ${cy+k} ${cx-r} ${cy} c`,`${cx-r} ${cy-k} ${cx-k} ${cy-r} ${cx} ${cy-r} c`,`${cx+k} ${cy-r} ${cx+r} ${cy-k} ${cx+r} ${cy} c f`,'Q');};
 // Soft light certificate stock with TECHNOVA's midnight, violet, cyan and gold accents.
 rect(0,0,W,H,'0.965 0.972 0.995');rect(18,18,W-36,H-36,'1 1 1','0.30 0.18 0.70',2.2);rect(28,28,W-56,H-56,'1 1 1','0.91 0.72 0.22',0.8);
 rect(29,28,W-58,9,'0.28 0.13 0.69');rect(29,37,8,3,'0.00 0.72 0.86');
 circle(74,78,24,'0.28 0.13 0.69');circle(74,78,16,'0.00 0.72 0.86');circle(74,78,8,'0.98 0.75 0.20');
 txt('TECHNOVA HUB',421,52,16,'F2','0.20 0.12 0.52','center');
 txt('LEARN. PRACTICE. PROVE. ACHIEVE.',421,76,8,'F2','0.18 0.45 0.60','center');
 line(150,102,692,102,'0.88 0.84 0.96',1);
 txt('CERTIFICATE OF COMPLETION',421,128,26,'F2','0.10 0.12 0.22','center');
 txt('This certificate is proudly presented to',421,181,12,'F1','0.34 0.36 0.44','center');
 txt(input.learnerName,421,210,28,'F2','0.28 0.13 0.68','center');
 line(235,251,607,251,'0.00 0.65 0.79',1.6);
 txt('for successfully completing the TECHNOVA HUB learning path',421,272,12,'F1','0.34 0.36 0.44','center');
 txt(input.pathTitle,421,302,22,'F2','0.08 0.10 0.19','center');
 txt(`Learning level: ${input.pathLevel}`,421,338,11,'F1','0.34 0.36 0.44','center');
 // Gold seal at the lower-left.
 circle(116,431,43,'0.98 0.78 0.28');circle(116,431,34,'0.28 0.13 0.69');circle(116,431,25,'1 1 1');
 txt('TNH',116,419,13,'F2','0.28 0.13 0.69','center');txt('VERIFIED',116,438,6,'F2','0.28 0.13 0.69','center');
 txt(`Issued: ${input.issuedAt}`,190,405,10,'F2','0.19 0.21 0.30');
 txt(`Certificate ID: ${input.code}`,190,427,10,'F2','0.19 0.21 0.30');
 txt('This certificate confirms completion of the listed TECHNOVA learning path.',190,453,8,'F1','0.40 0.42 0.48');
 txt('Verify online:',190,479,8,'F2','0.40 0.42 0.48');
 txt(input.verifyUrl,190,492,7,'F1','0.20 0.13 0.55');
 const matrix=createQrMatrix(input.verifyUrl);const module=3.0;const qrSize=matrix.length*module;const qx=670;const qTop=355;const quiet=8;
 rect(qx-quiet,qTop-quiet,qrSize+quiet*2,qrSize+quiet*2,'1 1 1','0.86 0.82 0.92',0.8);
 for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x]){const px=qx+x*module;const py=H-(qTop+(y+1)*module);c.push('q','0.05 0.07 0.14 rg',`${px.toFixed(2)} ${py.toFixed(2)} ${(module+0.08).toFixed(2)} ${(module+0.08).toFixed(2)} re f`,'Q');}
 txt('SCAN TO VERIFY',qx+qrSize/2,qTop+qrSize+18,7,'F2','0.28 0.13 0.69','center');
 line(45,552,797,552,'0.91 0.88 0.95',0.6);
 txt('TECHNOVA HUB  |  Learn. Practice. Prove. Achieve.',421,562,7,'F1','0.49 0.50 0.57','center');
 return c.join('\n');
}

export function buildCertificatePdf(input:{learnerName:string;pathTitle:string;pathLevel:string;issuedAt:string;code:string;verifyUrl:string}):Buffer{
 const content=makeContent(input);const objects:string[]=[];
 objects.push('<< /Type /Catalog /Pages 2 0 R >>');
 objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>');
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const stream=Buffer.from(content,'ascii');objects.push(`<< /Length ${stream.length} >>\nstream\n${content}\nendstream`);
 let pdf='%PDF-1.4\n%TECHNOVA\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,'ascii'));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf,'ascii');pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf,'ascii');
}
