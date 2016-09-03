function getBestMatchingRX(str, expressions){
    let bestMatchingRX;
    let bestMatchingGroupSize = Number.MAX_SAFE_INTEGER;
    let bestMatchingGroup;
    
    expressions.forEach(function(currentRX){
        const regex = new RegExp(currentRX.rx);
        const groups = str.match(regex);
        if (groups && groups.length < bestMatchingGroupSize){
            bestMatchingRX = currentRX;
            bestMatchingGroupSize = groups.length;
            bestMatchingGroup = groups;
        }
    });
    debugger;
    return {
        rule: bestMatchingRX,
        matching: bestMatchingGroup
    };
}

export default getBestMatchingRX;
