
const TYPES = {
    log:   '[  LG  ] :: ',
    info:  '[ INFO ] :: ',
    warn:  '[ WARN ] :: ',
    error: '[ FAIL ] :: ',
    track: '[ STEP ] :: '
};

const logger = {
    info: function () {
        let args = [].slice.call(arguments);
        args.unshift('color: blue');
        args.unshift('%c ' + TYPES.info);
        console.info.apply(console, args);
    },
    log: function () {
        let args = [].slice.call(arguments);
        args.unshift('color: gray');
        args.unshift('%c ' + TYPES.log);
        console.log.apply(console, args);
    },
    warn: function () {
        let args = [].slice.call(arguments);
        args.unshift('font-weight: bold; color: yellow; text-shadow: 0 0 1px black;');
        args.unshift('%c ' + TYPES.warn);
        console.warn.apply(console, args);
    },
    error: function () {
        let args = [].slice.call(arguments);
        args.unshift('font-weight: bold; color: red');
        args.unshift('%c ' + TYPES.error);
        console.error.apply(console, args);
    },
    track: function () {
        let args = [].slice.call(arguments);
        args.unshift('font-weight: bold');
        args.unshift('%c ' + TYPES.track);
        console.debug.apply(console, args);
    }
};


export default logger;