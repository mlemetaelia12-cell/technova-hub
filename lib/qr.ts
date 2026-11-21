const DATA_CODEWORDS = [0,19,34,55,80,108];
const ECC_CODEWORDS = [0,7,10,15,20,26];
function gfMultiply(x:number,y:number):number{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);if(((y>>>i)&1)!==0)z^=x;}return z;}
function rsDivisor(degree:number):number[]{const result=Array(degree).fill(0);result[degree-1]=1;let root=1;for(let i=0;i<degree;i++){for(let j=0;j<degree;j++){result[j]=gfMultiply(result[j],root);if(j+1<degree)result[j]^=result[j+1];}root=gfMultiply(root,2);}return result;}
function rsRemainder(data:number[],divisor:number[]):number[]{const result=Array(divisor.length).fill(0);for(const b of data){const factor=b^result[0];result.copyWithin(0,1);result[result.length-1]=0;for(let i=0;i<result.length;i++)result[i]^=gfMultiply(divisor[i],factor);}return result;}
function appendBits(out:number[],value:number,length:number){for(let i=length-1;i>=0;i--)out.push((value>>>i)&1);}
function formatBits(mask:number){const data=(1<<3)|mask;let rem=data;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);return ((data<<10)|rem)^0x5412;}

export function createQrMatrix(text:string):boolean[][]{
 const bytes=Array.from(new TextEncoder().encode(text));
 let version=0;for(let v=1;v<=5;v++){if(4+8+bytes.length*8<=DATA_CODEWORDS[v]*8){version=v;break;}}
 if(!version)throw new Error('Certificate verification URL is too long for the built-in QR generator.');
 const bits:number[]=[];appendBits(bits,4,4);appendBits(bits,bytes.length,8);for(const byte of bytes)appendBits(bits,byte,8);
 const capacity=DATA_CODEWORDS[version]*8;for(let i=0;i<Math.min(4,capacity-bits.length);i++)bits.push(0);while(bits.length%8)bits.push(0);
 const data:number[]=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];data.push(v);}
 for(let pad=0;data.length<DATA_CODEWORDS[version];pad++)data.push(pad%2===0?0xec:0x11);
 const all=[...data,...rsRemainder(data,rsDivisor(ECC_CODEWORDS[version]))];
 const size=17+version*4;const matrix=Array.from({length:size},()=>Array<boolean>(size).fill(false));const fn=Array.from({length:size},()=>Array<boolean>(size).fill(false));
 const setFn=(x:number,y:number,dark:boolean)=>{if(x>=0&&x<size&&y>=0&&y<size){matrix[y][x]=dark;fn[y][x]=true;}};
 const finder=(cx:number,cy:number)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy));setFn(cx+dx,cy+dy,d!==2&&d!==4);}};
 finder(3,3);finder(size-4,3);finder(3,size-4);
 for(let i=0;i<size;i++){if(!fn[6][i])setFn(i,6,i%2===0);if(!fn[i][6])setFn(6,i,i%2===0);}
 if(version>=2){const positions=[6,size-7];for(const cy of positions)for(const cx of positions){if(fn[cy][cx])continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)setFn(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}}
 // Reserve both copies of format information before placing data bits.
 for(let i=0;i<=5;i++)setFn(8,i,false);setFn(8,7,false);setFn(8,8,false);setFn(7,8,false);for(let i=9;i<15;i++)setFn(14-i,8,false);
 for(let i=0;i<8;i++)setFn(size-1-i,8,false);for(let i=8;i<15;i++)setFn(8,size-15+i,false);
 setFn(8,size-8,true); // fixed dark module
 let bitIndex=0;let upward=true;
 for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++){const y=upward?size-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(!fn[y][x]){let dark=bitIndex<all.length*8?((all[bitIndex>>>3]>>>(7-(bitIndex&7)))&1)!==0:false;if((x+y)%2===0)dark=!dark;matrix[y][x]=dark;bitIndex++;}}}upward=!upward;}
 const fmt=formatBits(0);for(let i=0;i<=5;i++)setFn(8,i,((fmt>>>i)&1)!==0);setFn(8,7,((fmt>>>6)&1)!==0);setFn(8,8,((fmt>>>7)&1)!==0);setFn(7,8,((fmt>>>8)&1)!==0);for(let i=9;i<15;i++)setFn(14-i,8,((fmt>>>i)&1)!==0);
 for(let i=0;i<8;i++)setFn(size-1-i,8,((fmt>>>i)&1)!==0);for(let i=8;i<15;i++)setFn(8,size-15+i,((fmt>>>i)&1)!==0);setFn(8,size-8,true);
 return matrix;
}
