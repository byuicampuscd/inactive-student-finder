/* eslint-env browser, node, jquery */
/* eslint no-console:0, semi:2*/
/* global */

var isBYUI = false,
    subdomain = isBYUI ? "byui" : "pathway",
    ousFileName = "./olsSmall.csv";

var Nightmare = require('nightmare');
require('nightmare-helpers')(Nightmare);
var prompt = require('prompt');
var properties = [
    {
        name: 'username',
        required: true
    }
    , {
        name: 'password',
        hidden: true,
        replace: '*',
        required: true
    }
  ];
var fs = require('fs');
var dsv = require('d3-dsv');
var nightmare = Nightmare({
    //    openDevTools: {
    //        mode: 'detach'
    //    },
    width: 1200,
    height: 900,
    show: true,
    //    webPreferences: {
    //        webSecurity: false,
    //    },
    typeInterval: 20,
    alwaysOnTop: false,
    waitTimeout: 100 * 1000
});

var promptData = {};
var students = [];
var i = 1;
var courses = dsv.csvParse(fs.readFileSync(ousFileName, "utf8")),
    errors = [];

function scrapePage(index, nightmare) {
    //scrape the page, and log the result
    console.log('scrapePage started');
    nightmare
        .evaluate(function () {
            var stuList = Array.from(document.querySelectorAll('table[summary*="participants"] tr'))

            //get just the students
            .filter(function (ele) {
                return Array.from(ele.querySelectorAll("label")).map(function (ele) {
                        return ele.innerText.trim();
                    })
                    .indexOf("Student") > -1;
            })

            //get the parts we need
            .map(function (eleIn) {
                var name, uid, objOut, orgId, lastAccess, course, ou,
                    ele = $(eleIn);
                //get name
                name = ele.find('[title*="Compose"]').html();
                uid = ele.find('[title*="Compose"]').attr("onclick").match(/\d+/g)[0];
                orgId = ele.find('label:nth-child(1)').html();
                lastAccess = ele.find('label:eq(2)').html() || "";
                console.log("The label" + ele.find('label:eq(2)').html());
                course = document.querySelector('.d2l-navbar-title').innerText;
                ou = document.querySelector('a.d2l-menuflyout-link-link').getAttribute("href").match(/(\d+)$/g)[0];
                objOut = {
                    name: name,
                    uid: uid,
                    orgId: orgId,
                    lastAccess: lastAccess,
                    course: course,
                    ou: ou
                };

                return objOut;
            });

            console.log(stuList);

            return stuList;
        }).then(function (data) {
            console.log("Scraped page" + i);
            //console.log(data);
            students = students.concat(data);
            goToNextCourse(index, nightmare);
        }).catch(function (error) {
            console.error('Failed:', error);
        });
}

function done(nightmare) {
    //close the view, and save the file
    console.log(students);
    var errFileName = "Errors.json";

    nightmare
        .end()
        .then(function () {
            console.log('Process Complete!');
            var coursesCSV = (dsv.csvFormat(students));
            fs.writeFileSync('student-list.csv', coursesCSV);
            console.log('File Written to student-list.csv');
            fs.writeFileSync('errors.js');

            if (errors.length > 0) {
                console.log("Some OUs didn't work. Look in the file " + errFileName);
                fs.writeFileSync(errFileName, JSON.stringify(errors, null, 4), "utf8");
            }
        })
        .catch(function (error) {
            console.error('Failed:', error);
        });
}

function goToNextCourse(index, nightmare) {
    index += 1;
    if (index === courses.length) {
        done(nightmare);
        return;
    }
    nightmare.run(function () {
            console.log((index + 1) + ":", "Starting " + courses[index].name);
        })
        .goto("https://" + subdomain + ".brightspace.com/d2l/lms/classlist/classlist.d2l?ou=" + courses[index].ou)
        .select('[title="Results Per Page"]', "200")
        .then(function () {
            scrapePage(index, nightmare);
        }).catch(function (e) {
            console.log("Error with " + courses[index].name, e);
            errors.push({
                index: index,
                course: courses[index],
                error: e
            });
            goToNextCourse(index, nightmare);
        });
}

function startNightmare(nightmare) {
    nightmare
        .goto('https://' + subdomain + '.brightspace.com/d2l/login?noredirect=true')
        .wait('#password')
        .insert('#userName', promptData.username)
        .insert('#password', promptData.password)
        //Click login
        .click('#formId div a')
        .waitURL('/d2l/home')
        .wait(1000)
        .then(function () {
            goToNextCourse(-1, nightmare);
        })
        .catch(function (e) {
            errors.push(e);
            goToNextCourse(-1, nightmare);
        });
}
//Get Username and Password for D2l
prompt.start();
prompt.get(properties, function (err, result) {
    if (err) {
        return onErr(err);
    }
    promptData = {
        username: result.username,
        password: result.password
    };
    console.log('Thanks, logging in');
    startNightmare(nightmare);
});

function onErr(err) {
    console.log(err);
    return 1;
}
