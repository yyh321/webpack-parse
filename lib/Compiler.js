const path = require('path')
const fs = require('fs')
let babylon = require('babylon')
let t = require('@babel/types')
let ejs = require('ejs')
let traverse = require('@babel/traverse').default
let generator = require('@babel/generator').default

// babylon 把源码转换成AST
// @babel/traverse 遍历节点
// @babel/types 替换节点
// @babel/generator 生成源码

class Compiler {
  constructor(config) {
    this.config = config
    // 保存入口文件
    this.entryId
    // 保存所有模块依赖
    this.modules = {}
    // 入口路径
    this.entry = config.entry
    // 工作路径
    this.root = process.cwd()
  }

  run() {
    // 执行并且创建模块依赖关系
    this.buildModule(path.resolve(this.root, this.entry), true)
    // 发射一个文件，打包后的文件
    this.emitFile()
  }

  buildModule(modulePath, isEntry) {
    let source = this.getSource(modulePath)
    // 获取模块相对路径
    let moduleName = './' + path.relative(this.root, modulePath)
    if (isEntry) {
      this.entryId = moduleName
    }
    let { sourceCode, dependencies } = this.parse(
      source,
      path.dirname(moduleName)
    )
    // console.log(sourceCode, dependencies)

    // 把相对路径和模块中的内容对应起来
    this.modules[moduleName] = sourceCode

    // 依赖查找
    dependencies.forEach(dep => {
      this.buildModule(path.join(this.root, dep), false)
    })
  }

  parse(source, parentPath) {
    let ast = babylon.parse(source)
    let dependencies = []
    traverse(ast, {
      CallExpression(p) {
        let node = p.node
        if (node.callee.name === 'require') {
          node.callee.name = '__webpack_require__'
          let moduleName = node.arguments[0].value
          moduleName = moduleName + (path.extname(moduleName) ? '' : '.js')
          moduleName = './' + path.join(parentPath, moduleName)
          dependencies.push(moduleName)
          node.arguments = [t.stringLiteral(moduleName)]
        }
      }
    })
    let sourceCode = generator(ast).code
    return {
      sourceCode,
      dependencies
    }
    // console.log('ast = ', ast, parentPath)
  }

  getSource(modulePath) {
    let content = fs.readFileSync(modulePath, 'utf8')
    return content
  }

  emitFile() {
    let main = path.join(this.config.output.path, this.config.output.filename)
    let templateStr = this.getSource(path.join(__dirname, 'main.ejs'))
    let code = ejs.render(templateStr, {
      entryId: this.entryId,
      modules: this.modules
    })
    this.assets = {}
    this.assets[main] = code
    fs.writeFileSync(main, this.assets[main])
  }
}

module.exports = Compiler
