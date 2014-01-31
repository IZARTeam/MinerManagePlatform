# DistributeClient
------------------
##本目录下为分布式平台的客户端

###配置
使用文本编辑器打开app.js，修改以下部分内容
<pre>
var config = {
  name : process.env.COMPUTERNAME , //此为节点在分布式管理平台中所显示的名字，默认为计算机名
  host : '127.0.0.1', //在此输入管理平台的IP地址
  port : 9080,        //在此输入管理平台上所设置的端口
  device : process.argv[2]
};
</pre>

###启动
启动方式为:<code>node app.js</code>

如果你的机器拥有多张显卡，可通过<code>node app.js [显卡编号:0,1,2...]</code>来启动

启动该客户端最少需要包含的文件为:

<pre>
app.js
AutoSocket.js
</pre>