
goog.require('myapp.UserType');

goog.provide('myapp.StaticES5');

/** @return {!myapp.UserType} */
myapp.StaticES5.create = function() {

    return /** @type{!myapp.UserType} */ ({
        name: 'name',
        type: 'type',
        index: 1
    });
};


/** @param {string} msg */
myapp.StaticES5.log = function(msg) {
    console.log(msg);
}