/**
 * Copyright 2017 University of Castilla - La Mancha
 */
var HTTPCODE = {
   OK: 200,
   BAD_REQUEST: 400,
   UNAUTHORIZED: 401,
   FORBIDDEN: 403,
   NOT_FOUND: 404,
   CONFLICT: 409,
   INTERNAL_ERROR: 500,
   NOT_IMPLEMENTED: 501
}

var ERRCODE = {
   // General error
   UNKNOWN: {
      'message': "Internal error",
      'code': 1
   },
   INEXISTENT_METHOD: {
      'message': "The requested method does not exists in current API.",
      'code': 2
   },
   AUTH_REQUIRED: {
      'message': "Authorization is needed for the requested route.",
      'code': 3
   },
   AUTH_FAILED: {
      'message': "Failed to authenticate token.",
      'code': 4
   },
   AUTH_REQ_MALFORMED: {
      'message': "Authorization request is malformed.",
      'code': 5
   },
   AUTH_PERMISSION_DENIED: {
      'message': "Admin privileges required.",
      'code': 6
   },
   LOGIN_FAILED: {
      'message': "Incorrect username or password.",
      'code': 8
   },

   // Development
   NOT_IMPLEMENTED: {
      'message': "Not Implemented",
      'code': 10
   },

   // ID errors
   ID_NOT_FOUND: {
      'message': "Requested ID has not been found!",
      'code': 20
   },

   // Application
   APP_NOT_FOUND: {
      'message': "Requested application has not been found!",
      'code': 30
   },
   APP_INCORRECT_PARAMS: {
      'message': "You must pass 'name', 'creation_script', 'execution_script' and 'path'.",
      'code': 31
   },
   APP_NO_OPERATION: {
      'message': "You must pass 'op' argument. Possible: discoverMetadata.",
      'code': 32
   },

   // Experiment
   EXP_NOT_FOUND: {
      'message': "Requested experiments has not been found!",
      'code': 40
   },
   EXP_INCORRECT_PARAMS: {
      'message': "You must pass 'name' and 'app_id'.",
      'code': 41
   },
   EXP_MALFORMED_LABELS: {
      'message': "Error parsing labels JSON",
      'code': 42
   },
   LAUNCH_INCORRECT_PARAMS: {
      'message': "You must pass 'nodes', 'image_id' and 'size_id'.",
      'code': 43
   },
   LAUNCH_QUOTA_REACHED: {
      'message': "Quota has been reached.",
      'code': 44
   },
   EXP_NO_OPERATION: {
      'message': "You must pass 'op' argument. Possible: [launch, reloadTrees].",
      'code': 45
   },
   EXP_UNKNOWN_OPERATION: {
      'message': "Unknown operation, possible operations: [launch, reloadTrees].",
      'code': 46
   },
   EXP_CODE_FILE_PATH_MISSING: {
      'message': "Please provide a file path with 'file' query.",
      'code': 47
   },
   EXP_INPUT_FILE_PATH_MISSING: {
      'message': "Please provide a file path with 'file' query.",
      'code': 48
   },
   EXP_CODE_FILE_NOT_FOUND: {
      'message': "Source file does not exits.",
      'code': 49
   },
   EXP_INPUT_FILE_NOT_FOUND: {
      'message': "Input file does not exits.",
      'code': 50
   },

   // Executions
   EXEC_NOT_FOUND: {
      'message': "Selected execution does not exits.",
      'code': 60
   },
   EXEC_NO_OUTPUT_DATA: {
      'message': "Output data does not exist for this execution.",
      'code': 61
   },
   EXEC_LOG_NOT_FOUND: {
      'message': "Requested log does not exits.",
      'code': 62
   },
   EXEC_OUTPUT_FILE_NOT_FOUND: {
      'message': "Output file does not exits.",
      'code': 63
   },

   // Users
   USER_CREATE_INCORRECT_PARAMS: {
      'message': "You must pass 'username' and 'password'.",
      'code': 70
   },
   USER_CREATE_USERNAME_UNAVAILABLE: {
      'message': "Requested username is not available.",
      'code': 71
   },
   USER_NOT_FOUND: {
      'message': "Requested user has not been found!",
      'code': 72
   },
   USER_PERMISSIONS_INCORRECT_PARAMS: {
      'message': "You must pass 'permission', 'value' and 'allow'.",
      'code': 75
   },

   // Content-Type
   REQ_CONTENT_TYPE_TEXT_PLAIN: {
      'message': "Required Content-Type text/plain.",
      'code': 100
   },
}

exports.HTTPCODE = HTTPCODE;
exports.ERRCODE = ERRCODE;
