<?php

$post = $_POST;
if($post['data']) {
    $json = json_encode($post['data'], JSON_FORCE_OBJECT|JSON_NUMERIC_CHECK);
    $conent = <<<EOT
jsondata = $json;
EOT;
    file_put_contents('data.js', $conent);
    echo 'ok';
}