BEGIN TRANSACTION;
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES
('doc:book-hello-computer','hello-computer',NULL,'Hello Computer · 一台计算机如何醒来','# Hello Computer · 一台计算机如何醒来

从电流、指令、内存到操作系统，建立一台真正能在脑中运行的计算机模型。

本书正在持续写作中。当前书架先开放目录与导读。','public','2251213429@qq.com',100,1,198,'从晶体管到进程，沿着一条真实指令理解计算机。'),
('doc:book-hello-ai','hello-ai',NULL,'Hello AI · 模型如何学会回答','# Hello AI · 模型如何学会回答

从数据、表示、损失函数到推理，拆开 AI 的黑箱，理解模型为何会得到一个答案。

本书正在持续写作中。当前书架先开放目录与导读。','public','2251213429@qq.com',110,1,28,'从一个预测开始，理解现代 AI 的训练与推理。'),
('doc:book-product-shape','product-shape',NULL,'产品获得形状 · 从想法到可用现场','# 产品获得形状 · 从想法到可用现场

一套面向独立创作者与小团队的产品实践：把模糊想法推进成可体验、可讨论、可迭代的作品。

本书正在持续写作中。当前书架先开放目录与导读。','public','2251213429@qq.com',120,1,8,'从问题定义到上线反馈，建立产品的连续工作流。');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES
('doc:hello-computer-preface','preface','doc:book-hello-computer','序言 · 先让计算机在脑中运行','# 序言 · 先让计算机在脑中运行

我们不从术语开始，而从一次具体的按键开始：输入如何变成电信号，电信号如何被解释为指令，指令如何改变寄存器，再如何留下一个可观察的结果。

阅读目标不是背下零件名称，而是能沿着数据流解释每一个状态变化。', 'public','2251213429@qq.com',101,0,198,'建立从输入到执行的连续心智模型。'),
('doc:hello-ai-preface','preface','doc:book-hello-ai','序言 · 不把模型当作魔法','# 序言 · 不把模型当作魔法

一个模型的回答来自数据、参数、计算和上下文的共同作用。我们从一个最小预测问题出发，让每个抽象概念都落回可计算的数字。', 'public','2251213429@qq.com',111,0,28,'从最小预测问题拆开 AI 的黑箱。'),
('doc:product-shape-preface','preface','doc:book-product-shape','序言 · 想法必须进入现场','# 序言 · 想法必须进入现场

产品不是一句定位，也不是一张漂亮的页面。它必须被一个真实的人打开、理解、使用，并在反馈中继续变化。本书记录这条从想法到现场的路径。', 'public','2251213429@qq.com',121,0,8,'把产品从概念推进到可体验的现场。');INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-computer-1','01-','doc:book-hello-computer','第 01 章 一次按键如何进入计算机','# 第 01 章 一次按键如何进入计算机

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',102,0,198,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-computer-2','02-','doc:book-hello-computer','第 02 章 二进制不是数字的另一种写法','# 第 02 章 二进制不是数字的另一种写法

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',103,0,198,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-computer-3','03-','doc:book-hello-computer','第 03 章 指令如何穿过数据通路','# 第 03 章 指令如何穿过数据通路

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',104,0,198,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-computer-4','04-','doc:book-hello-computer','第 04 章 内存为什么需要地址','# 第 04 章 内存为什么需要地址

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',105,0,198,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-computer-5','05-','doc:book-hello-computer','第 05 章 操作系统如何接管硬件','# 第 05 章 操作系统如何接管硬件

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',106,0,198,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-ai-1','01-','doc:book-hello-ai','第 01 章 从一次预测开始','# 第 01 章 从一次预测开始

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',112,0,28,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-ai-2','02-','doc:book-hello-ai','第 02 章 特征如何成为表示','# 第 02 章 特征如何成为表示

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',113,0,28,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-ai-3','03-','doc:book-hello-ai','第 03 章 损失函数如何改变参数','# 第 03 章 损失函数如何改变参数

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',114,0,28,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-ai-4','04-','doc:book-hello-ai','第 04 章 训练与推理为何不同','# 第 04 章 训练与推理为何不同

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',115,0,28,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:hello-ai-5','05-','doc:book-hello-ai','第 05 章 一个答案如何被生成','# 第 05 章 一个答案如何被生成

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',116,0,28,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:product-shape-1','01-','doc:book-product-shape','第 01 章 模糊想法如何变成问题','# 第 01 章 模糊想法如何变成问题

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',122,0,8,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:product-shape-2','02-','doc:book-product-shape','第 02 章 第一版为什么必须可体验','# 第 02 章 第一版为什么必须可体验

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',123,0,8,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:product-shape-3','03-','doc:book-product-shape','第 03 章 交互如何表达产品判断','# 第 03 章 交互如何表达产品判断

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',124,0,8,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:product-shape-4','04-','doc:book-product-shape','第 04 章 反馈如何进入下一轮','# 第 04 章 反馈如何进入下一轮

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',125,0,8,'章节导读');
INSERT INTO docs (id,slug,parent_id,title,body_md,visibility,author_email,sort_order,is_book,cover_hue,summary) VALUES ('doc:product-shape-5','05-','doc:book-product-shape','第 05 章 上线不是故事的结尾','# 第 05 章 上线不是故事的结尾

本章导读正在编写。这里会从一个真实问题开始，给出具体数据，推演自然直觉在哪里撞墙，再建立可运行的心智模型。

当前状态：目录预置，正文待续。','public','2251213429@qq.com',126,0,8,'章节导读');
COMMIT;

