const Sequelize = require('sequelize');
const db = require('./index.js')

module.exports = {
  sequelize: db.sequelize,
  getVersion: function(caseName, cb) {
    db.Case.find({where:{name: caseName}}).then((caseObj) => {
      caseObj.getVersions().then((versions) => {
       var versionNumber = versions.length + 100
        cb(versionNumber)
      })
    })

  },

  createNewIOC: function(caseName, IOC, iocType, cb) {

      db.Case.find({where:{name: caseName}}).then((caseObj) => {

      if (caseObj) {
        db.IOC.find({where: {ioc: IOC, type: iocType}}).then((ioc) => {
          if (ioc) cb("Error: ioc already exist in this case", null);
          if (!ioc) {
            db.IOC.create({ioc: IOC, type: iocType}).then((ioc) => {
              ioc.addCase(caseObj)
              module.exports.getVersion(caseName, (currentVersion) => {
                var newVersion = currentVersion + 1;
                db.Version.create({number: newVersion}).then((version) => {
                  // version.addCase(caseObj);
                  version.addCase(caseObj, {through: {diff: `{"createdIOC":"${IOC}"}`}});
                  cb(null, "ok");
                })
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
              // version.addCase(newCase);
              version.addCase(newCase, {through: {diff: `{"createdIOC":"${IOC}", "createdCase":"${caseName}"}`}})
              cb(null, "success");
            })
          })
        })
      }
    })
},


 updateIOC: function(fromValue, toValue, iocType, caseName, cb) {
      db.Case.find({where:{name: caseName}}).then((caseObj) => {
      if (!caseObj) {
        cb('case does not exist', null);
      }

      if (caseObj) {
        db.IOC.find({where: {ioc: fromValue, type: iocType}}).then((ioc) => {
          if (!ioc) cb("ioc does not exist in this case", null);

          if (ioc) {
            db.IOC.create({ioc: toValue, type: iocType}).then((ioc) => {
              ioc.addCase(caseObj);
              // db.Diff.create({ data: `{modifiedIOC:${fromValue}to${toValue}` }).then( (diff) => {},  {include: [ db.CaseVersion ] });
              module.exports.getVersion(caseName, (currentVersion) => {
                var newVersion = currentVersion + 1;
                db.Version.create({number: newVersion}).then((version) => {

                  // version.addCase(caseObj);
                  version.addCase(caseObj, {through: {diff:`{"modifiedIOC":{"from":"${fromValue}", "to":"${toValue}"}}`}});

                  cb(null, "ok");
                })
              })
            })
          }
        })
      }
    })
  },


  deleteIOC: function(iocToDelete, iocType, caseName, cb) {
    db.Case.find({where:{name: caseName}}).then((caseObj) => {
      if (!caseObj) {
        cb('case does not exist', null);
      }

      if (caseObj) {
        db.IOC.find({where: {ioc: iocToDelete, type: iocType}}).then((ioc) => {
          if (!ioc) cb('ioc does not exist', null);
          if (ioc) {
            module.exports.getVersion(caseName, (currentVersion) => {
              var newVersion = currentVersion + 1;
              db.Version.create({number: newVersion}).then((version) => {
                version.addCase(caseObj, {through: {diff:`{deletedIOC:${iocToDelete}}`}});
                cb(null, "ok");
              })
            })
          }
        })
      }
    })
  },

getCaseIdAndVersionIdsByCasename: function(caseName, cb) {
    db.Case.find({where: {name: caseName}}).then((caseObj) => {
      if (!caseObj)  cb("case not found", null)

      if (caseObj) {
        var caseID = caseObj.id
        var versionIds = []
        var caseVersionMap = {}

        caseObj.getVersions().then((versions) => {
          versionIDs = versions.map((elem) => {
            return elem.id
          })
          caseVersionMap = {caseName: caseName, caseId: caseID, versionId: versionIDs }
          cb(null, caseVersionMap)
        })
      }
    })
  },


    __unpackCreatedIOC: function(arr, objValue) {
      // take arr and string value, returns array
      arr.push(objValue)

  },

  __unpackDeletedIOC: function(arr, objValue) {
    // takes array and objValue, returns: array
    // var deepCopy = arr.slice(0)

    var indexToDelete = arr.indexOf(objValue)
    if (indexToDelete === -1) return "elem to delete not found"
    else arr.splice(indexToDelete, 1)
    // else deepCopy.splice(indexToDelete, 1)
    // return deepCopy
  },

   __unpackModifiedIOC: function(arr, objValue) {
    // takes
    // var deepCopy = arr.slice(0)
    var fromValue = objValue.from;
    var toValue = objValue.to;

    var indexToModify = arr.indexOf(fromValue);
    if (indexToModify === -1) return "elem to delete not found"
    else arr.splice(indexToModify, 1, toValue)
    // else deepCopy.splice(indexToModify, 1, toValue)
    // return deepCopy
  },

  // sample diff = [ '{"createdIOC":"33derder1.exe", "createdCase":"APT100"}', '{"createdIOC":"7.7.7.7"}', '{"modifiedIOC":{"from":"7.7.7.7", "to":"5.5.5.5"}}' ]

  processDiffs: function(diffs) {
    var output = []
    console.log('!!!!!****** Before....  ****** !!!!!!')
    console.log(diffs)

    diffs.forEach((DBtransaction) => {
      for (var [key, value] of Object.entries(JSON.parse(DBtransaction))) {
        if (key === 'createdIOC') {
          module.exports.__unpackCreatedIOC(output, value)
        }

        if (key === 'modifiedIOC') {
          module.exports.__unpackModifiedIOC(output, value)
        }

        if (key === 'deletedIOC') {
          module.exports.__unpackDeletedIOC(output, value)
        }
      }
    })
    console.log('!!!!!****** RECONTRUCTED IOCS FOR THE VERSION  ****** !!!!!!')
    console.log(output)
  },

  createAnArrayOfDiffs: function(caseName, versionNumber, cb) {
    var diffs = []
    var versionCount = versionNumber - 100 // 100 was starting point
    module.exports.getCaseIdAndVersionIdsByCasename(caseName, (err, caseVersionMap) => {
      if (err) console.log('Error In fetching case id for this caseName')
      if (caseVersionMap) {
        console.log('^^^^^^^^^^^^^ ')
        var caseID = caseVersionMap.caseId
        var versionIDs = caseVersionMap.versionId.slice(0, versionCount + 1)
        console.log(caseVersionMap)
        console.log(versionIDs)
        db.CaseVersion.findAll({where:{caseId: caseID,  versionId:versionIDs}}).then((caseVersionObj) => {
          caseVersionObj.forEach((elem) => diffs.push(elem.diff))
          module.exports.processDiffs(diffs)
        })
      }
    })
  },




  deleteCase: function() {},
  getIOCsOFCase: function() {},
  getVersionsOFCase: function() {},
  getVersionsOFIOC: function() {},
  getVersionsOFCase: function() {},
}




module.exports.createNewIOC("APT101", "33derder1.exe", "file", (err, result) => {
  console.log("result ****************", result);
  console.log("errr ****************", err);
})

// module.exports.createNewIOC("APT120", "aksdkda.exe", "file", (err, result) => {
//   console.log("result ****************", result);
//   console.log("errr ****************", err);


//     module.exports.createNewIOC("APT100", "33derder1.exe", "file", (err, result) => {
//     console.log("result ****************", result);
//     console.log("errr ****************", err);

//     module.exports.createNewIOC("APT100", "33derder1.exe", "file", (err, result) => {
//     console.log("result ****************", result);
//     console.log("errr ****************", err);

//       module.exports.createNewIOC("APT100", "7.7.7.7", "IP", (err, result) => {
//       console.log("result ****************", result);
//       console.log("errr ****************", err);


//         module.exports.updateIOC("7.7.7.7", "5.5.5.5", "IP", "APT100", (err, result) => {
//           console.log("result ****************", result);
//           console.log("errr ****************", err);

//           module.exports.deleteIOC("5.5.5.5", "IP", "APT103", (err, result) => {
//           console.log("result ****************", result);
//           console.log("errr ****************", err);
//           })
//         })
//       })
//     })
//   })
// })


module.exports.createAnArrayOfDiffs("APT100", 102, (err, diff) => {
  console.log("diff ****************", diff);
  console.log("err ****************", err);
})
