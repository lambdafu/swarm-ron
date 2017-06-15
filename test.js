"use strict";
const Op = require('./index');
const Frame = Op.Frame;
const Iterator = Frame.Iterator;
const UUID = require('swarm-ron-uuid');
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
eq(a.key(), '.0#id');

const frame = '.lww#test@time-orig!:int=1:str"2"';
const ops = [
    ".lww#test@time-orig!",
    ".lww#test@time-orig:int=1",
    ".lww#test@time-orig:str\"2\"",
];
const vals = [
    Op.FRAME_ATOM,
    1,
    "2"
];
const f = new Op.Frame(frame);
const nf = new Op.Frame();
for(let op of f) {
    eq(op.toString(), ops.shift());
    eq(op.value(0), vals.shift());
    nf.push(op);
}
eq(nf.toString(), frame);

const subs = {"$A":"1","$B":"2"};
const mapd = Op.Frame.map_uuids("@$A>0:$B>~", uuid => {
    return uuid in subs ? UUID.fromString(subs[uuid]) : uuid;
});
eq(mapd, "@1>0:2>~");

const big = '.lww#test@time-orig!:int=1@(1:str"2"@(3:ref>3';
const from = new Iterator(big);
from.nextOp();
const till = from.clone();
till.nextOp();
till.nextOp();
const crop = Frame.slice(from, till);
eq(crop, '.lww#test@time-orig:int=1@(1:str"2"');

