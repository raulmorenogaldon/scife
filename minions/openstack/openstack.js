// Load API
var pkgcloud  = require('pkgcloud'),
    _ = require('underscore');

// Load RPC module
var zerorpc = require("zerorpc");

// Module vars
var compute;
var blockstorage;
var rpc_client = new zerorpc.Client();

// Connect to OpenStack minion
rpc_client.connect("tcp://localhost:4242");

// Call login
login(function(){
	var name = "CentOS 7";
	var path = "/home/devstack/CentOS-7.x86_64.qcow2";
	//uploadImage(name, path);

	// List available images
	getImages(function(images){
		console.log("Images:");
		images.forEach(function(image) {
			console.log("---> ",image.name);
		});
	});
});

// Login to OpenStack
function login(callback) {
	rpc_client.invoke("login", "OpenStack", function(error, res, more) {
		console.log("error: ",error);
		console.log("res: ",res);
		console.log("more: ",more);
		if(error) {
			console.error("Failed to connect to OpenStack %s, code: %d","http://TODO:5000",error);
		}
		else {
			console.log("Connected to OpenStack");
			callback();
		}
	});
}

// Create and upload an Image
function uploadImage(name, path) {
	rpc_client.invoke("uploadImage", name, path, function(error, res, more) {
		if(error) {
			console.error("Failed to upload image: ",path);
		}
		else {
			console.log("Image uploaded: ", name);
		}
	});
}

// Get a list of images in the system
function getImages(callback) {
	rpc_client.invoke("getImages", function(error, res, more) {
		if(error) {
			console.error("Failed to getImages, code: ",error);
			return null;
		}
		else {
			callback(res);
		}
	});
}

function createInstance(name,image_id) {
	rpc_client.invoke("createInstance", name, image_id, function(error, res, more) {
		if(res[0] != 0)
			console.log("ERROR: Failed to createInstance, code: %d",res[0]);
		else
			console.log("Instance:" + res[1]);
	});
}

function deleteInstance(inst_id) {
	rpc_client.invoke("deleteInstance", inst_id, function(error, res, more) {
		if(res[0] != 0)
			console.log("ERROR: Failed to deleteInstance, code: %d",res[0]);
		else
			console.log("Deleted");
	});
}

exports.login = login
