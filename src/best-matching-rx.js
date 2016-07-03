function getBestMatchingRX(str){
    let bestMatchingRX;
    let bestMatchingGroup = Number.MAX_SAFE_INTEGER;
    rx.forEach(function(currentRX){
        const regex = new RegExp(currentRX);
        const groups = regex.exec(str);
        if (groups && groups.length < bestMatchingGroup){
            bestMatchingRX = currentRX;
            bestMatchingGroup = groups.length;
        }
        console.log(groups);
    });
    return bestMatchingRX;
}

export default getBestMatchingRX;
