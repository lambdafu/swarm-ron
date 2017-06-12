"use strict";
const Op = require('./index');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;

const a = Op.fromString("#id=1");
eq(a.object.value, 'id');
eq(a.object.origin, '0');
eq(a.object.sep, '$');
eq(a.value(0), 1);
eq(a.type+'', '0');

const frame = '.lww#test@time-orig!:int=1:str"2"';
const ops = [
    ".lww#test@time-orig!",
    ".lww#test@time-orig:int=1",
    ".lww#test@time-orig:str\"2\"",
];
const f = new Op.Frame(frame);
const nf = new Op.Frame();
for(let op of f) {
    eq(op.toString(), ops.shift());
    nf.push(op);
}
eq(nf.toString(), frame);
