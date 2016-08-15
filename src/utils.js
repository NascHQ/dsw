
const utils = {
    applyMatch (matching, text) {
        if (matching && matching.length > 1 && text) {
            // we apply the variables
            matching.forEach(function(cur, idx){
                text = text.replace(new RegExp('\\$' + idx, 'i'), cur);
            });
        }
        return text;
    }
};

export default utils;
