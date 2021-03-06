const Sequelize = require('sequelize');
const db = require('./index.js');
const request = require('request');

var _checkDiff = function(caseName, cb) {

  module.exports.getDiffOfLastTwoVersions(caseName, (err, IOCs) => {
    if (IOCs.length > 0) {
      var query = `{"caseName":"${caseName}", "IOCsDiff":"${IOCs}"}`;
      cb(null, query)
    }
    if (!IOCs || IOCs.length === 0) {
      cb('no additional iocs', null);
    }

  })
}


var _ifBSupersetOfA = function(arrA, arrB) {
  // if all elements of A are in B and B must have some more.
  var allElementsOfAinB = arrA.every((elem) => {
    return (arrB.indexOf(elem) !== -1)
  })
  if (allElementsOfAinB && arrB.length > arrA.length) return true
  else return false
}


var _getVersion = function(caseName, cb) {

  db.Case.find({where:{name: caseName}}).then((caseObj) => {
    if (caseObj === null) cb('case not found', null);
    caseObj.getVersions().then((versions) => {
      var versionNumber = versions.length - 1 + 100
        cb(null, versionNumber)
    })
  })
}

var _iocExistsInCurrentCaseState = function(caseName, IOC, cb) {
  // get the last version of the case
  _getVersion(caseName, (err, currentVersion) => {
    // recontruct and check if the last version has this ioc, if not, then create, else not.
    module.exports.getCaseVersionSnapshot(caseName, currentVersion, (err, currentState) => {
      if (err) cb(err, null)
      else cb(null, currentState.includes(IOC));

    });
  });
}


var _getCaseIdAndVersionIdsByCasename = function(caseName, versionNumber, cb) {
    db.Case.find({where: {name: caseName}}).then((caseObj) => {
      if (!caseObj)  cb(`case ${caseName} not found`, null)

      if (caseObj) {

        var caseID = caseObj.id
        var versionIds = []
        var caseVersionMap = {}

        caseObj.getVersions().then((versions) => {
          // versions.length should never be zero, because as soon as case created it has a version 100

          // creating an array of versionNumbers just to check if the required versionNumber exists and provide proper error
          versionNumbers = versions.map((elem) => {
            return elem.number
          })

          if (versionNumbers.indexOf(versionNumber) === -1 ) cb(`version ${versionNumber} not found in case ${caseName} `, null)

          else if (versionNumbers.indexOf(versionNumber) !== -1 ) {
            versionIDs = versions.map((elem) => {
            return elem.id
              })
            caseVersionMap = {caseName: caseName, caseId: caseID, versionId: versionIDs }
            cb(null, caseVersionMap)
           }
        })
      }
    })
  }


  var __unpackCreatedIOC = function(arr, objValue) {
      arr.push(objValue)

  }

  var __unpackDeletedIOC = function(arr, objValue) {
    var indexToDelete = arr.indexOf(objValue)
    if (indexToDelete === -1) return "elem to delete not found"
    else arr.splice(indexToDelete, 1)
  }

  var  __unpackModifiedIOC = function(arr, objValue) {
    var fromValue = objValue.from;
    var toValue = objValue.to;

    var indexToModify = arr.indexOf(fromValue);
    if (indexToModify === -1) return "elem to delete not found"
    else arr.splice(indexToModify, 1, toValue)
  }

  // sample diff = [ '{"createdIOC":"33derder1.exe", "createdCase":"APT100"}', '{"createdIOC":"7.7.7.7"}', '{"modifiedIOC":{"from":"7.7.7.7", "to":"5.5.5.5"}}' ]

  var _processDiffs = function(diffs) {
    var output = []
    diffs.forEach((DBtransaction) => {
      for (var [key, value] of Object.entries(JSON.parse(DBtransaction))) {
        if (key === 'createdIOC') {
          __unpackCreatedIOC(output, value)
        }

        if (key === 'modifiedIOC') {
          __unpackModifiedIOC(output, value)
        }

        if (key === 'deletedIOC') {
          __unpackDeletedIOC(output, value)
        }
      }
    })
    return output
  }


module.exports = {

createIOC: function(caseName, IOC, iocType, cb) {

      db.Case.find({where:{name: caseName}}).then((caseObj) => {

      if (caseObj) {

        _iocExistsInCurrentCaseState(caseName, IOC, (err, iocExists) => {

          if (iocExists) {
            cb(`ioc ${IOC} already exists in case ${caseName} `, null);
          } else {
            db.IOC.create({ioc: IOC, type: iocType}).then((ioc) => {
            ioc.addCase(caseObj)
            _getVersion(caseName, (err, currentVersion) => {
              var newVersion = currentVersion + 1;
              db.Version.create({number: newVersion}).then((version) => {
                version.addCase(caseObj, {through: {diff: `{"createdIOC":"${IOC}"}`}});
                cb(null, "ok");

                // _checkDiffAndSearchInLogs(caseName, (err, result) => {
                //   cb(null, "ok");
                // });

                })


                // _checkDiffAndSearchInLogs(caseName, (err, result) => {
                //   cb(null, "ok");
                // });
              })
            })
          }
        })

      }

      if (!caseObj) {
        db.Case.create({name: caseName}).then((newCase) => {
          db.IOC.find({where: {ioc: IOC, type: iocType}}).then((ioc) => {
            if (ioc) {
              // if ioc exist then dont create it
              ioc.addCase(newCase)
            } else if (!ioc) {
              // if ioc does not exist then create it
              db.IOC.create({ioc: IOC, type: iocType}).then((ioc) => {
                ioc.addCase(newCase)
              })
            }

            db.Version.create({number:100}).then((version) => {
              version.addCase(newCase, {through: {diff: `{"createdIOC":"${IOC}", "createdCase":"${caseName}"}`}})

              cb(null, "success");
              // _checkDiffAndSearchInLogs(caseName, (err, result) => {
              //    cb(null, "ok");
              // });

            })


            // _searchInLogs(caseName, (err, result) => {
            //   cb(null, "ok");
            // });


          })
        })
      }
    })
},


 updateIOC: function(caseName, fromValue, toValue, iocType, cb) {
    db.Case.find({where:{name: caseName}}).then((caseObj) => {
    console.log('INSIDE UPDATE ***** !caseOjb')
    if (!caseObj) {
      console.log('INSIDE UPDATE ***** !caseOjb')
      cb(`case ${caseName} does not exist`, null);
    }

    if (caseObj) {
       console.log('INSIDE UPDATE ***** caseOjb')

       _iocExistsInCurrentCaseState(caseName, fromValue, (err, iocExists) => {
          if (!iocExists) cb('no ioc found to modify', null);
          if (iocExists) {
            db.IOC.create({ioc: toValue, type: iocType}).then((ioc) => {
              ioc.addCase(caseObj);
              _getVersion(caseName, (err, currentVersion) => {
                var newVersion = currentVersion + 1;
                db.Version.create({number: newVersion}).then((version) => {
                  version.addCase(caseObj, {through: {diff:`{"modifiedIOC":{"from":"${fromValue}", "to":"${toValue}"}}`}});
                  // _checkDiffAndSearchInLogs(caseName, (err, result) => {
                  // });
                  cb(null, "ok");

                })
              })
            })
          }
      })
    }
  })
},

  deleteIOC: function(caseName, iocToDelete, iocType, cb) {
    db.Case.find({where:{name: caseName}}).then((caseObj) => {
      if (!caseObj) {
        cb(`case ${caseName} does not exist`, null);
      }
      if (caseObj) {
        // it is possible that someone re-created the ioc after deleting. If so, it should be able to delete again and so on.
        _iocExistsInCurrentCaseState(caseName, iocToDelete, (err, iocExists) => {
          if (!iocExists) cb(`ioc ${iocToDelete} already does not exist`, null);
          if (iocExists) {
            _getVersion(caseName, (err, currentVersion) => {
            var newVersion = currentVersion + 1;
            db.Version.create({number: newVersion}).then((version) => {
              version.addCase(caseObj, {through: {diff: `{"deletedIOC":"${iocToDelete}"}`}});
                cb(null, "ok");
              })
            })
          }
        })
      }
    })
  },

  readIOC: function(caseName, versionNumber, cb) {
    if (versionNumber !== 'latest') {
      versionToRead = versionNumber;
      module.exports.getCaseVersionSnapshot(caseName, versionNumber, (err, iocs) => {
        if (err) cb(err, null)
        if (iocs) cb(null, iocs)
      });
    }

    if (versionNumber === 'latest') {
      _getVersion( caseName, (err, currentVersion) => {
        module.exports.getCaseVersionSnapshot(caseName, currentVersion, (err, iocs) => {
          if (err) cb(err, null)
          if (iocs) cb(null, iocs)
        });
      })
    }
  },


  searchInLogs: function(caseName, cb) {
    _checkDiff(caseName, (err, query) => {
      if (err) cb(err, null)
      else if (query) {
        request.post('http://search-node:5002/searchioc', {form:{query}}, ((err, resp, body) => {
          if (err) cb(err, null)
          else cb(null, 'done');
        }));
      }
    })
  },


  getCaseVersionSnapshot: function(caseName, versionNumber, cb) {
    var diffs = []
    var versionCount = versionNumber - 100 // 100 is starting point for every version number
    _getCaseIdAndVersionIdsByCasename(caseName, versionNumber, (err, caseVersionMap) => {
      if (err) cb(err, null)
      if (caseVersionMap) {
        var caseID = caseVersionMap.caseId
        var versionIDs = caseVersionMap.versionId.slice(0, versionCount + 1)
        db.CaseVersion.findAll({where:{caseId: caseID,  versionId:versionIDs}}).then((caseVersionObj) => {
          caseVersionObj.forEach((elem) => diffs.push(elem.diff))
          output = _processDiffs(diffs)
          // output is array after reconstruction
          cb(null, output)
        })
      }
    })
  },


  getDiffOfLastTwoVersions: function(caseName, cb) {
    _getVersion(caseName, (err, currentVersion) => {
      if (err) cb(err, null);
      var previousVersion = currentVersion - 1
      module.exports.readIOC(caseName, currentVersion, (err, currentIOCs) => {
        if (currentVersion === 100 && currentIOCs) {
          cb(null, currentIOCs);
        } else {
          module.exports.readIOC(caseName, previousVersion, (err, previousIOCs) => {
            if (_ifBSupersetOfA(previousIOCs, currentIOCs)) {
              var diffs = currentIOCs.filter((elem) => {
                return (previousIOCs.indexOf(elem) === -1)
              })
              cb(null, diffs)
            } else cb(`currentVersion ${currentVersion} is not superset of prev version ${previousVersion} `, null)
          })
        }
      })
    })
  },

getCaseVersions: function(caseName, cb) {
    var versions = [];
    db.Case.find({where:{name: caseName}}).then((caseObj) => {
      caseObj.getVersions().then((versionObj) => {
          if (!versionObj === 0) cb('no version found', null)
          else {
            versionObj.forEach((elem) => versions.push(elem.number))
            cb(null, versions)
          }
      })
    })
  },



  getAllCases: function(cb) {
    db.Case.findAll({}).then((caseObj) => {
      var cases = []
      if (!caseObj) cb('no case found', null)
      else {
        caseObj.forEach((elem) => cases.push(elem.name))
        cb(null, cases)
      }
    })
  },

  getCaseActivities: function(cb) {

    db.CaseVersion.findAll().then((caseVerObjects) => {
      var result = [];
      var event;
      caseVerObjects.forEach( (caseVerObj) => {
        db.Case.find({where: {id: caseVerObj.caseId}}).then( (caseObj) => {
          db.Version.find({where: {id: caseVerObj.versionId}}).then( (verObj) => {
            event = {"caseName": caseObj.name, "version": verObj.number, "diff": caseVerObj.diff, "createdAt":caseVerObj.createdAt, "updatedAt": caseVerObj.updatedAt}
            result.push(event)
            console.log("*********")
            console.log(JSON.stringify(result))
            if (caseVerObjects.length === result.length) {
              cb(null, result)
            }
          })
        })
      })
    })
  },



 getAllCasesWithTimeStamps: function(cb) {
      var casesWithTimestamps = [];
      db.Case.findAll({}).then((cases) => {
      if (cases.length === 0 || !cases) cb('no case found', null)
      else {
        cases.forEach((caseObj) => {
          var versionIds = []
          db.CaseVersion.findAll({where: {caseId: caseObj.id}}).then((versions) => {
            versions.forEach((versionObj) => { versionIds.push([versionObj.id, versionObj.updatedAt ])})
            casesWithTimestamps.push([ caseObj.name, caseObj.createdAt, versionIds[versionIds.length -1 ][1] ])
            if (cases.length === casesWithTimestamps.length) {
              cb(null, casesWithTimestamps)
            }
          })
        })
      }
    })
  }
}



// module.exports.getDiffOfLastTwoVersions('SOMECASE', (err, res) => {
//   console.log('somecase case')
//   console.log('err is ', err);
//   console.log('res is ', res);
// })


// module.exports.createIOC("APT120", "44.exe", "file", (err, result) => {

//   module.exports.createIOC("APT100", "111.exe", "file", (err, result) => {
//     module.exports.createIOC("APT100", "7.7.7.7", "IP", (err, result) => {

//       module.exports.createIOC("APT100", "111.exe", "file", (err, result) => {
//         module.exports.createIOC("APT100", "7.7.7.7", "IP", (err, result) => {

//           module.exports.updateIOC("APT100", "7.7.7.7", "5.5.5.5", "IP", (err, result) => {
//             module.exports.deleteIOC("33derder1.exe", "file", "APT100", (err, result) => {

//               module.exports.deleteIOC("APT100", "5.5.5.5", "IP", (err, result) => {

//               })
//             })
//           })
//         })
//       })
//     })
//   })
// })
