# Github Gist Migrator

Migrate your blog from [Github Gist] to [Hexo]. ( ͡° ͜ʖ ͡°)✧ 

[Live Demo] (https://xujiaao.github.io)


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

Just add this line in `_config.yml`.

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
