"use strict";
const RON = require('swarm-ron-grammar');
const UUID = require('swarm-ron-uuid');

/** A RON op object. Typically, an Op is hosted in a frame.
 *  Frames are strings, so Op is sort of a Frame iterator.
 *  */
class Op {

    /**
     * A trusted Op constructor
     * @param type {UUID}
     * @param object {UUID}
     * @param event {UUID}
     * @param location {UUID}
     * @param values {String}
     */
    constructor (type, object, event, location, values) {
        /** @type {UUID} */
        this.type = type;
        /** @type {UUID} */
        this.object = object;
        /** @type {UUID} */
        this.event = event;
        /** @type {UUID} */
        this.location = location;
        /** @type {String} */
        this.values = values;
        // @type {Array}
        this.parsed_values = undefined;
        // @type {String}
        this.source = null;
    }

    value (i) {
        if (!this.parsed_values)
            this.parsed_values = Op.ron2js(this.values);
        return this.parsed_values[i];
    }

    isHeader () {
        return this.values===Op.FRAME_SEP || this.value(0)===Op.FRAME_ATOM;
    }

    isQuery () {
        return this.values===Op.QUERY_SEP || this.value(0)===Op.QUERY_ATOM;
    }

    isRegular () {
        return !this.isHeader() && !this.isQuery();
    }

    isError () {
        return this.event.value===UUID.ERROR.value;
    } 

    /**
     *
     * @param body {String} -- serialized frame
     * @param context {Op} -- previous/context op
     * @param offset {Number} -- frame body offset
     * @return {Op}
     */
    static fromString (body, context, offset) {
        const ctx = context || Op.ZERO;
        const off = offset || 0;
        Op.RE.lastIndex = off;
        const m = Op.RE.exec(body);
        if (!m || m.index!==off)
            return null;
        const ret = new Op(
            UUID.fromString(m[1], ctx.type),
            UUID.fromString(m[2], ctx.object),
            UUID.fromString(m[3], ctx.event),
            UUID.fromString(m[4], ctx.location),
            m[5]
        );
        ret.source = m[0];
        return ret;
    }

    /** Get op UUID by index (0-3)
     * @return {UUID} */
    uuid (i) {
        switch (i) {
            case 0: return this.type;
            case 1: return this.object;
            case 2: return this.event;
            case 3: return this.location;
            default: throw new Error('incorrect uuid index');
        }
    }

    /**
     * @param context_op {Op}
     * @return {String}
     */
    toString (context_op) {
        let ret = '';
        const ctx = context_op || Op.ZERO;
        for(let u=0; u<4; u++) {
            const uuid = this.uuid(u);
            const def = ctx.uuid(u);
            if (uuid.eq(def)) continue;
            let str = uuid.toString();
            if (u) for(let d=0; d<4 && str.length>1; d++) if (d!==u) {
                const def = d ? ctx.uuid(d) : this.uuid(u-1);
                const restr = Op.REDEF_SEPS[d] + uuid.toString(def);
                if (restr.length<str.length)
                    str = restr;
            }
            ret += Op.UUID_SEPS[u];
            ret += str;
        }
        ret += this.values;
        return ret;
    }


    /**
     * Parse RON value atoms.
     * @param values {String} -- RON atoms
     * @return {Array} -- parsed values
     */
    static ron2js (values) {
        Op.VALUE_RE.lastIndex = 0;
        let m = null, ret = [];
        while (m=Op.VALUE_RE.exec(values)) {
            if (m[1]) {
                ret.push(parseInt(m[1]));
            } else if (m[2]) {
                ret.push(JSON.parse(m[2]));
            } else if (m[3]) {
                ret.push(parseFloat(m[3]));
            } else if (m[4]) {
                ret.push(UUID.fromString(m[4]));
            } else if (m[5]) {
                ret.push(Op.FRAME_ATOM);
            } else if (m[6]) {
                ret.push(Op.QUERY_ATOM);
            }
        }
        return ret;
    }

    /**
     * Serialize JS primitives into RON atoms.
     * @param values {Array} -- up to 8 js primitives
     * @return {String} -- RON atoms serialized
     */
    static js2ron (values) {
        const ret = values.map( v => {
            if (!v) return Op.UUID_ATOM_SEP + UUID.ZERO.toString();
            switch (v.constructor) {
                case String: return JSON.stringify(v);
                case Number: return Number.isInteger(v) ?
                    Op.INT_ATOM_SEP + v : Op.FLOAT_ATOM_SEP + v;
                case UUID: return Op.UUID_ATOM_SEP + v.toString();
                default:
                    if (v===Op.FRAME_ATOM) return Op.FRAME_SEP;
                    if (v===Op.QUERY_ATOM) return Op.QUERY_SEP;
                    throw new Error("unsupported type");
            }
        });
        return ret.join('');
    }

}

Op.RE = new RegExp(RON.OP.source, 'g');
Op.VALUE_RE = new RegExp(RON.ATOM, 'g');
Op.ZERO = new Op(UUID.ZERO,UUID.ZERO,UUID.ZERO,UUID.ZERO,">0");
Op.END = new Op(UUID.ERROR,UUID.ERROR,UUID.ERROR,UUID.ERROR,'>~');
Op.PARSE_ERROR = new Op
    (UUID.ERROR,UUID.ERROR,UUID.ERROR,UUID.ERROR,'>parseerror');
Op.REDEF_SEPS = "`\\|/";
Op.UUID_SEPS = ".#@:";
Op.FRAME_ATOM = Symbol("FRAME");
Op.QUERY_ATOM = Symbol("QUERY");
Op.INT_ATOM_SEP = '=';
Op.FLOAT_ATOM_SEP = '^';
Op.UUID_ATOM_SEP = '>';
Op.FRAME_SEP = '!';
Op.QUERY_SEP = '?';

class Frame {
    
    constructor (string) {
        this.body = string ? string.toString() : '';
        this.last_op = Op.ZERO;
    }

    /**
     * Append a new op to the frame
     * @param op {Op}
     */
    push (op) {
        this.body += op.toString(this.last_op);
        this.last_op = op;
    }

    [Symbol.iterator]() {
        return new Iterator (this.body);
    }
    
    toString () {
        return this.body;
    }

    /**
     * Substitute UUIDs in all of the frame's ops.
     * Typically used for macro expansion.
     * @param raw_frame - {String}
     * @param fn {Function} - the substituting function
     */
    static map_uuids (raw_frame, fn) {
        const ret = new Frame();
        for(const i=new Iterator(raw_frame); i.op; i.nextOp())
            ret.push(new Op(
                fn(i.op.type)||i.op.type,
                fn(i.op.object)||i.op.object,
                fn(i.op.event)||i.op.event,
                fn(i.op.location)||i.op.location,
                i.op.values
            ));
        return ret.toString();
    }

    /**
     * Crop a frame, i.e. make a new [from,till) frame
     * @param from {Iterator} -- first op of the new frame
     * @param till {Iterator} -- end the frame before this op
     * @return {String}
     */
    static crop (from, till) {
        if (!from.op) return '';
        if (from.body!==till.body)
            throw new Error("iterators of different frames");
        let ret = from.op.toString();
        ret += from.body.substring(
            from.offset+from.length,
            till.op ? till.offset : undefined
        );
        return ret;
    }
    
}

class Iterator {

    constructor (body) {
        this.body = body || '';
        this.offset = 0;
        this.length = 0;
        /** @type {Op} */
        this.op = this.nextOp();
    }

    /**
     * @return {Iterator}
     */
    clone () {
        const ret = new Iterator(this.body);
        ret.offset = this.offset;
        ret.length = this.length;
        ret.op = this.op;
        return ret;
    }

    nextOp () {
        this.offset += this.length;
        if (this.offset===this.body.length) {
            this.op = null;
            this.length = 1;
        } else {
            this.op = Op.fromString(this.body, this.op, this.offset);
            if (this.op !== null)
                this.length = this.op.source.length;
        }
        return this.op;
    }

    next () {
        const ret = this.op;
        if (ret) this.nextOp();
        return {
            value: ret,
            done: ret===null
        }
    }
    
}

/** A stream of frames. */
class Stream {

    /**
     * Subscribe to updates.
     * @param query {String}
     * @param stream {Stream}
     */
    on (query, stream) {
    }

    /**
     * Unsubscribe
     * @param query {String}
     * @param stream {Stream}
     */
    off (query, stream) {
    }

    /**
     * Push a new op/frame to the log.
     * @param frame {String}
     */
    push (frame) {
    }

    /**
     * Receive a new update (frame)
     * @param frame {String}
     */
    update (frame) {
    }

}

Op.Frame = Frame;
Op.Stream = Stream;
Frame.Iterator = Iterator;
module.exports = Op;
