const express = require('express');
const redis = require('redis');
const Joi = require('joi');
const async = require('async');
const exphbs = require('express-handlebars');
var bodyParser = require('body-parser');
const Handlebars = require('handlebars');
Handlebars.registerHelper("link", function(url, type, id) {
      var _type = Handlebars.escapeExpression(type),
          _url = Handlebars.escapeExpression(url),
          _id = Handlebars.escapeExpression(id);    
          if(_type == "")
            _type = " ";      
     return new Handlebars.SafeString(_url + "/" + _type + "/" + _id);
});
Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {

    switch (operator) {
        case '==':
            return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
            return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
            return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    }
});
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.engine('hbs', exphbs({ 
    extname:'hbs', 
    defaultLayout: 'layout', 
    layoutsDir: __dirname + '/views/layouts/',
    partialsDir: __dirname + '/views/partials'
}));
app.set('view engine', 'hbs');
app.use(express.static('views'));
const port = process.env.PORT || 3001;
const redis_port = process.env.REDIS_PORT || 6379;
const redis_cli = redis.createClient(redis_port);

const genres = [
    {id : "ACT", name : "Action" },
    {id : "ADV", name : "Adventure" },
    {id : "COM", name : "Comedy" },
    {id : "CRM", name : "Crime" },
    {id : "DRM", name : "Drama" },
    {id : "FAN", name : "Fantasy" },
    {id : "HIS", name : "Historical" },
    {id : "HFIC", name : "Historical fiction" },
    {id : "HOR", name : "Horror" },
    {id : "MYS", name : "Mystery" }
];

//rendering home page
app.get('/', (req, res) => {
    res.render('home', {genres_types : genres, title : "Welcome to my express handlebars tutorial."});
});

//rendering create new genre
app.get('/api/genres/create-new-genre', (req, res) => {
    res.render('genre', {genres_types : genres, title : "Create a new genre"});
});

//Post new genre to redis
app.post('/api/genres', (req, res) => {
    console.log(req.body);
     var { error } = validateGenre(req.body);
     if(error) return res.send(error.details[0].message); 
    const genre = {
        'Type' : req.body.Type,
        'Id' : req.body.Id,
        'Name' : req.body.Name,
        'CreatedDate' : new Date().toISOString(),
        'Email' : req.body.Email,
        'Description' : req.body.Description
    };
    console.log(genre);
    redis_cli.hmset('Genres_' + req.body.Type  + "_" + req.body.Id, genre, (err, obj) => {
        if(err) return  res.send(err);
        else return res.render('item', {genres_types : genres, genre : genre, title : 'Genre has been successfully created...!'});
    });
});

app.get('/api/genres/edit/:type/:id', (req, res) => {
    const genre = redis_cli.hgetall(`Genres_${req.params.type}_${req.params.id}`, (err, obj) => {
        if(err) return res.send(err);
        else return res.render('genre', {genres_types : genres, genre : obj, title : `Edit genre id: ${req.params.id}`});
    });
});

// Update genre by id
app.put('/api/genres/:id', (req, res) => {
    redis_cli.hgetall('Genres_' + req.body.Type + "_" + req.body.Id, (err, value) => {
        if(err) return res.send(err);
        else
        {
             const obj = {
                 'Name' : req.body.Name,
                 'Id' : req.params.id
             };            
            var { error } = validateGenre(obj);
            if(error) return res.send(error.details[0].message);
            redis_cli.hmset("Genres_" + value.Id, obj, (error, result)=>{
                if(error) return res.send(error);
                else return res.send(result);
            });
        }
    });
});

// filter by Genre type Ex : ACT - Action, COM - Comedy, DRM - Drama ex...
app.get('/api/genres/', (req, res) => {
    var search_query = 'Genres_';
    if(req.query.Type)
    search_query += req.query.Type + "_";
    console.log(search_query);
    if(req.query.id)        
    search_query += req.query.id;
    else
    search_query += '*';
    console.log(search_query);
    redis_cli.keys(search_query, (err, keys) => {
        if(err) return res.send(err);
        else
        {
            async.map(keys, (key, callback) => {
                redis_cli.hgetall(key, (error, obj) => {
                    if(error) return res.send(error);
                    else
                    {
                        callback(null, obj);
                    }
                });
            },
            (error, results) => {
                if(error) return res.send(error);
                else return res.render('list', {searchvalue : req.params.id, genres_types : genres, genres : results, title : 'Search results page', metatitle : `Genres filter by Type: ${req.query.Type} and Id: ${req.query.id}`});
            });
        }
    });
});

//Genre delete by id and return deleted item
app.delete('/api/genres/delete/:type/:id', (req, res) => {
    const genre = "";
    redis_cli.hgetall('Genres_' + req.params.type + "_" + req.params.id, (err, obj) => {
        if(err) return res.status(404).send("The genre with given id connot find");  
        else {
            redis_cli.del("Genres_" + req.params.type + "_" + req.params.id, (error, result) => {
                if(error) return res.send(error);
                else return res.redirect('/');
            });
        }
    });
});

//Get all are availlable genres 
// app.get('/api/genres', (req, res) => {   
//     redis_cli.keys("Genres_*", (err, keys) =>{
//         if(err) return res.send(err);
//         else
//         {
//             async.map(keys, function(key, cb){
//                 redis_cli.hgetall(key, (error, value) => {
//                     if(error) return res.send(error);
//                     else
//                     {
//                         cb(null, value);
//                     }
//                 });
//             },
//             function(error, results) {
//                 if(error) return res.send(error);
//                 else return res.render('list', { title : 'Genre List', genres : results, genres_types : genres});
//             });
//         }
//     });
// });

//Get Genre by Id
app.get('/api/genres/:type:id', (req, res) => {
    console.log('Jaya' + req.params.type + "_" + req.params.id);
    redis_cli.hgetall("Genres_" + req.params.type + "_" + req.params.id, (err, obj) => {
        if(err) return res.send(err);
        else
        {
            //obj.Id = req.params.id;    
            console.log(obj);        
            return res.render('item', {genres_types : genres, genre : obj, title : 'Genre details page'});
        }            
    });
});

function validateGenre(genre)
{
    const schema = {
        Id : Joi.string().min(3).required(),
        Name : Joi.string().min(3).required(),
        Type: Joi.string().min(3).required(),
        Email: Joi.string(),
        Description : Joi.string()
    };
    return Joi.validate(genre, schema);
}

app.listen(port, () => console.log(`Application listen to port ${port}....`));