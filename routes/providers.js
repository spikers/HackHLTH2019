var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {

  var request = require("request");

  var options = { method: 'GET',
    url: 'https://api.logicahealth.org/hspcdemo/open/Patient',
    headers: 
    { 'Postman-Token': '21f57621-c695-4441-8835-81fe262517da',
      'cache-control': 'no-cache' } };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);
    console.log('This is the body: ', body);
    var patientData = JSON.parse(body);
    var basicPatientData = [];
    for (var i = 0; i < patientData.entry.length; i++) {
      var currentPatient = {};
      currentPatient.name = patientData.entry[i].resource.name[0].given.join(' ') + ' ' + patientData.entry[i].resource.name[0].family.join(' ');
      currentPatient.patientId = patientData.entry[i].resource.id;
      basicPatientData.push(currentPatient);
      currentPatient.url = 'Providers/Patients/' + patientData.entry[i].resource.id;
    }

    res.render('providers', { title: 'Express', basicPatientData: basicPatientData });
  });


});


router.get('/Patients/:patientId', function(req, res, next) {
  
  var request = require("request");

  var options = { method: 'GET',
    url: 'https://api.logicahealth.org/hspcdemo/open/Observation',
    qs: { patient: req.params.patientId },
    headers: 
    { 'Postman-Token': '8e418acf-f546-4b1e-af79-ca22e34175f3',
      'cache-control': 'no-cache' } };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    var ob = JSON.parse(body);
    var observations = [];
    var commentPromises = [];

    for (var i = 0; i < ob.entry.length; i++) {
      var currentCommentPromise = getComment(ob.entry[i].resource.id);
      commentPromises.push(currentCommentPromise);

      console.log('This is the current entry: ', ob.entry[i]);
      var currentObservation = {
        id: ob.entry[i].resource.id,
        category: ob.entry[i].resource.category.text,
        type: ob.entry[i].resource.code.text,
        comment: 'No Comment',
        value: 'No value found'
      };
      if (ob.entry[i].resource.hasOwnProperty('valueCodeableConcept')) {
        currentObservation.value = ob.entry[i].resource.valueCodeableConcept.text;
      } else if (ob.entry[i].resource.hasOwnProperty('valueQuantity')) {
        currentObservation.value = ob.entry[i].resource.valueQuantity.value + ' ' + ob.entry[i].resource.valueQuantity.unit;
      } else if (ob.entry[i].resource.hasOwnProperty('valueString')) {
        currentObservation.value = ob.entry[i].resource.valueString;
      } else if (ob.entry[i].resource.hasOwnProperty('valueBoolean')) {
        currentObservation.value = ob.entry[i].resource.valueBoolean;
      } else if (ob.entry[i].resource.hasOwnProperty('valueInteger')) {
        currentObservation.value = ob.entry[i].resource.valueInteger;
      } else if (ob.entry[i].resource.hasOwnProperty('valueRange')) {
        currentObservation.value = ob.entry[i].resource.valueRange;
      } else if (ob.entry[i].resource.hasOwnProperty('valueRatio')) {
        currentObservation.value = ob.entry[i].resource.valueRatio;
      } else if (ob.entry[i].resource.hasOwnProperty('valueSampledData')) {
        currentObservation.value = ob.entry[i].resource.valueSampledData;
      } else if (ob.entry[i].resource.hasOwnProperty('valueTime')) {
        currentObservation.value = ob.entry[i].resource.valueTime;
      } else if (ob.entry[i].resource.hasOwnProperty('valueDateTime')) {
        currentObservation.value = ob.entry[i].resource.valueDateTime;
      } else if (ob.entry[i].resource.hasOwnProperty('valuePeriod')) {
        currentObservation.value = ob.entry[i].resource.valuePeriod;
      } else {
        currentObservation.value = 'No value found';
      }
      observations.push(currentObservation);
    }

    Promise.all(commentPromises).then(function(values) {
      for (var i = 0; i < observations.length; i++) {
        observations[i].comment = values[i];
      }
      console.log(observations);
      res.render('providerpatientview', { title: 'Express', patient: { patientId: req.params.patientId, patientObservations: observations } });
    }).catch(error => { 
      console.error(error.message)
    });
  });
});

router.post('/Patients/SaveData', function(req, res, next) {
  console.log('req.bodaaay', req.body);
  console.log('typeof(req.body)', typeof(req.body));
  var entries = req.body.entries;
  // var entries = JSON.parse(req.body).entries;
  console.log('entries', entries[0].observationId, entries[0].comment);
  var rowExistsPromises = [];

  for (var i = 0; i < entries.length; i++) {
    var currentPromise = rowExists(entries[i].observationId);
    rowExistsPromises.push(currentPromise);
  }

  Promise.all(rowExistsPromises).then(function (values) {
    var entriesUpToDatePromises = [];
    for (var j = 0; j < values.length; j++) {
      console.log('values[j]', values[j])
      var currentEntry = updateComment(entries[j].observationId, entries[j].comment, values[j])
      entriesUpToDatePromises.push(currentEntry);
    }
    Promise.all(entriesUpToDatePromises).success(function (values) {
      res.json('{ "status": "success" }');
    });
  }).catch(error => { 
    res.json('{ "status": "error" }');
  });
  
});

async function updateComment(observationId, comment, rowExists) {
  var mysql = require('mysql');
  var query = '';
  if (rowExists) {
    query = 'UPDATE comments SET comment = \'' + comment + '\' WHERE ObservationId=\'' + observationId + '\'';
  } else {
    query = 'INSERT INTO comments (comment, ObservationId) VALUES (\'' + comment + '\', \'' + observationId + '\')';
  }
  var comment = 'No Comment';
  console.log('Query: ', query);

  var connection = mysql.createConnection({
    host: 'localhost',
    user: 'timfeng',
    password: 'toor',
    database: 'HealthHack'
  });

  connection.connect();

  var prom = new Promise(function (resolve, reject) {
    connection.query(query, function (err, rows, fields) {
      if (err) throw err
      if (rows.length === 0) {
        resolve(false);
      } else if (rows.length > 0) {
        resolve(true);
      }
    });
    connection.end();
  });
  return prom;
}



async function rowExists(observationId) {
  var mysql = require('mysql');

  var query = 'SELECT * FROM comments WHERE ObservationId=\'' + observationId + '\'';
  var comment = 'No Comment';
  console.log('Query: ', query);

  var connection = mysql.createConnection({
    host: 'localhost',
    user: 'timfeng',
    password: 'toor',
    database: 'HealthHack'
  });

  connection.connect();

  var prom = new Promise(function (resolve, reject) {
    connection.query(query, function (err, rows, fields) {
      if (err) throw err
      if (rows.length === 0) {
        resolve(false);
      } else if (rows.length > 0) {
        resolve(true);
      }
    });
    connection.end();
  });
  return prom;
}

async function getComment(observationId) {
  var mysql = require('mysql');

  var query = 'SELECT * FROM comments WHERE ObservationId=\'' + observationId + '\'';
  var comment = 'No Comment';
  console.log('Query: ', query);

  var connection = mysql.createConnection({
    host: 'localhost',
    user: 'timfeng',
    password: 'toor',
    database: 'HealthHack'
  });

  connection.connect();

  var prom = new Promise(function (resolve, reject) {
    connection.query(query, function (err, rows, fields) {
      if (err) throw err
      if (rows.length === 0) {
        comment = 'No Comment';
        resolve(comment);
      } else if (rows.length > 0) {
        console.log('This is rows: ', JSON.stringify(rows));
        console.log('This is comment: ', rows[0].Comment);
        comment = rows[0].Comment;
        resolve(comment);
      }
    });
    connection.end();
  });


  return prom;

}


module.exports = router;
