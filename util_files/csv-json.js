// simple function to convert csv data into json format

const fs = require('fs');

exports.toJSON = (csvFile) =>{
    const lines = csvFile.split('\n')
    const result = []
    const headers = lines[0].split(',')
    
    for (let i = 1; i < lines.length; i++) {        
        if (!lines[i])
        continue
        const obj = {}
        const currentline = lines[i].split(',')
        
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentline[j]
        }
        result.push(obj)
    }
    return result
}