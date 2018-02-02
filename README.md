# Github Gist Migrator

Migrate your blog from [Github Gist] to [Hexo]. ( ͡° ͜ʖ ͡°)✧ 

:trollface: [Demo](https://xujiaao.github.io)


## Install

``` bash
$ npm install hexo-migrator-gists --save
```


## Usage

Execute the following command to create/update posts from [Github Gist].

``` bash
$ hexo migrate gists
```


### Advanced Usage

#### Save Github Gist Id

Add this line to `_config.yml`, then the plugin will stop asking for your username.

````yml
# Gists
gists_user: <your github gist id>
````


#### Front-matter

You can use [Hexo Front-matter] in posts, plugin will automatically merge them.

````markdown
---
title: New title...
tags:
- Android
- Android Things
---
````


#### Hide Contents

Hide the contents which you don't want to be shown in your blog. For example, the header line.

````markdown
<!-- @Gist(hide) -->
# Contents to be hidden in your blog...
<!-- @Gist(hide) -->
````


[Github Gist]: https://gist.github.com

[Hexo]: https://hexo.io

[Hexo Front-matter]: https://hexo.io/docs/front-matter.html
