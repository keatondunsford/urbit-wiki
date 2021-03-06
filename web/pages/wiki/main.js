window.urb.appl = "wiki"

debugEnabled = true

if (debugEnabled) var debug = console.log.bind(window.console)
else var debug = function(){}

function bindPath(path, callback) {
  window.urb.bind("/wiki/" + path, callback)
}

function dropPath(path, callback) {
  window.urb.drop("/wiki/"  + path, callback)
}

function articleContentPath(article) {
  // escape illegal chars in the article name and add a unique suffix
  // to prevent issues with duplicate subscriptions
  return "article/content/" + escapePathElement(article) + "/" + Date.now()
}

function articleHistoryPath(article) {
  // escape illegal chars in the article name and add a unique suffix
  // to prevent issues with duplicate subscriptions
  return "article/history/" + escapePathElement(article) + "/" + Date.now()
}

/**
 * escape illegal chars for subscription paths (wimilar to ++wood)
 */
function escapePathElement(s) {
  var e = ""
  var i = 0
  for (i = 0; i< s.length; ++i) {
    var c = s.charAt(i)
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || (c == '-')) {
      e += c

    } else if (c == ' ') {
      e += '.'

    } else if (c == '.') {
      e += '~.'

    } else if (c == '~') {
      e += '~~'

    } else {
      e += "~" + s.charCodeAt(i).toString(16) + "."
    }
  }

  return e
}

function poke(article, callback) {
  window.urb.send(
    article,
    {mark: "wiki-change"},
    (err,res) => {
      if (err) {
        debug(err)
        //this.error = "There was an error. Sorry!"

      } else if(res.data !== undefined &&
         res.data.ok !== undefined &&
         res.data.ok !== true) {

        debug(res.data.res)
        //this.error = res.data.res

      } else {
        if (callback) {
          callback()
        }
      }
    })
}

function render(content) {
  // replace internal links
  var linkPattern = /\[\[([^\]]*)\]\]/
  var parts = content.split(linkPattern)
  content = ""
  for (i in parts) {
    if (i % 2 == 1) {
      var escaped = encodeURIComponent(parts[i])
      content += "[" + parts[i] + "](/pages/wiki#/view/" + escaped + ")"

    } else {
      content += parts[i]
    }
  }

  return marked(content)
}

/**
 * Mixin for components that need to subscribe to an urbit path
 *
 * The component must define a property (or a computed property) called
 * 'urbitBindPath', and a callback method called 'urbitAccept'
 *
 * This path will be bound when the component is created and dropped when the
 * component is destroyed.
 * It will also be dropped and rebound when the route changes.
 */
var urbitSubscriptionMixin = {
  data: function() {
    return {
      urbitBoundPath: null,
    }
  },
  created: function() {
    this.urbitBind()
  },
  destroyed: function() {
    this.urbitDrop()
  },
  watch: {
    '$route' (to, from) {
      this.urbitDrop()
      this.urbitBind()
    }
  },
  methods: {
    urbitBind: function() {
      if (this.urbitBindPath) {
        this.urbitBoundPath = this.urbitBindPath
        bindPath(this.urbitBoundPath, this.urbitAccept)
      }
    },
    urbitDrop: function() {
      if (this.urbitBoundPath) {
        dropPath(this.urbitBoundPath, this.urbitAccept)
      }
    }
  }
}


const AllArticles = {
  template: `
    <div>
      <nav-bar />

      <h1>Articles</h1>
      <div v-if="$root.dukeOrBetter">
        <input v-model.trim="newArticle" />
        <button @click="editNewArticle" :disabled="newArticleDisabled">New</button>
      </div>
      <div v-else>
        <button title="Duke rank (planet) or higher required to create new articles" disabled="true">New</button>
      </div>
      <ul v-for="article in articles">
        <li><router-link :to="{ name: 'view', params: { article: article } }">{{ article }}</router-link></li>
      </ul>
      <div v-if="loading">Loading...</div>
      <div v-else-if="articles.length == 0">
        No articles found
      </div>
    </div>
  `,
  data: function() {
    return  {
      newArticle: "",
    }
  },
  computed: {
    newArticleDisabled: function() {
      if (this.newArticle.length == 0) {
        return true
      }

      return false
    },
    loading: function() {
      return this.$root.articlesLoading
    },
    articles: function() {
      return this.$root.articles
    }
  },
  methods: {
    editNewArticle: function() {
      this.$router.push({ name: "edit", params: { article: this.newArticle } })
    }
  }
}


const Edit = {
  mixins: [ urbitSubscriptionMixin ],
  props: [ "article" ],
  template: `
    <div>
      <nav-bar :article="article" :version="version" />

      <h1>Edit {{ article }}</h1>
      <div>
        <small>as ~{{ $root.user }}</small>
      </div>
      <div>
        <textarea cols="80" rows="25" v-model="content" :disabled="loading" />
      </div>
      <div>
        Change description: <input type="text" v-model.trim="message" />
      </div>
      <div>
        <button @click="preview">Preview</button>
        <button @click="save" :disabled="saveDisabled">Save</button>
        <button @click="back(false)">Cancel</button>
      </div>

      <div v-if="changedOnServer">
        Warning: a newer version has been saved, you'll need to reload before
        saving your changes
      </div>

      <div>{{ error }}</div>

      <div v-if="previewContent">
        <h2>Preview</h2>
        <div v-html="previewContent" style="border: 1px solid black" />
      </div>
    </div>
  `,
  data: function() {
    return {
      loading: true,
      content: "loading...",
      version: null,
      error: null,
      previewContent: null,
      changedOnServer: false,
      message: ""
    }
  },
  computed: {
    urbitBindPath: function() {
      this.loading = true
      return articleContentPath(this.article)
    },
    saveDisabled: function() {
      if (this.loading || this.changedOnServer) {
        return true
      }

      if (this.message.length == 0) {
        return true
      }

      return false
    }
  },
  methods: {
    urbitAccept: function(err, dat) {
      if (dat.data.article != this.article) {
        return
      }
      if (!this.loading) {
        if (dat.data.version != this.version) {
          this.changedOnServer = true
        }
        return
      }
      this.content = dat.data.content
      this.version = dat.data.version
      this.loading = false
      this.changedOnServer = false
    },
    preview: function() {
      this.previewContent = render(this.content)
    },
    save: function() {
      poke({
        "type": "write",
        "article": this.article,
        "content": this.content,
        "version": this.version,
        "message": this.message,
      }, () => {
        this.back(true)
      })
    },
    back: function(saved) {
      if (this.version == "0" && !saved) {
        this.$router.push({ path: "/"} )

      } else {
        this.$router.push({ name: "view", params: { article: this.article } })
      }
    }
  }
}


const View = {
  mixins: [ urbitSubscriptionMixin ],
  props: [ "article" ],
  template: `
    <div>
      <nav-bar :article="article" :editable="true" :author="author" :at="at" />

      <h1>{{ article }}</h1>
      <div v-if="loading">
        Loading...
      </div>
      <div v-else v-html="contentRendered" />
    </div>
  `,
  data: function() {
    return {
      loading: true,
      content: null,
      author: null,
      at: null,
    }
  },
  computed: {
    urbitBindPath: function() {
      this.loading = true
      return articleContentPath(this.article)
    },
    contentRendered: function() {
      if (this.content == null) {
        return "Loading..."
      }

      return render(this.content)
    }
  },
  methods: {
    urbitAccept: function(err, dat) {
      if (dat.data.article != this.article) {
        return
      }
      if (dat.data.version == "0") {
        this.edit()
        return
      }
      this.content = dat.data.content
      this.author = dat.data.author
      this.at = new Date(dat.data.at).toString()
      this.loading = false
    },
    edit: function() {
      this.$router.push({ name: "edit", params: { article: this.article } })
    }
  }
}


const History = {
  mixins: [ urbitSubscriptionMixin ],
  props: [ "article" ],
  template: `
    <div>
      <nav-bar :article="article" :history="true" />
      <h1>History of {{ article }}</h1>
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Date</th>
            <th>Author</th>
            <th>Description</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="rev in revisions" :style="rev == selected ? 'background: grey': ''" @click="selected = rev">
            <td><a @click.prevent="selected = rev" href="#">{{ rev.version }}</a></td>
            <td>{{ new Date(rev.at).toString() }}</td>
            <td>{{ rev.author }}</td>
            <td>{{ rev.message }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="selected">
        <div>
          View as:
          <input type="radio" id="view-source" value="source" v-model="viewAs" />
          <label for="view-source">Source</label>
          <input type="radio" id="view-preview" value="preview" v-model="viewAs" />
          <label for="view-preview">Preview</label>
        </div>

        <h1>Version {{selected.version}}</h1>

        <div v-if="viewAs == 'preview'" style="border: 1px black solid">
          <div v-html="contentRendered"  />
        </div>
        <div v-else>
           <textarea v-model="selected.content" disabled="true" cols="80" rows="20" />
        </div>
      </div>
    </div>
  `,
  data: function() {
    return {
      revisionMap: {},
      revisions: [],
      selected: null,
      viewAs: "preview",
    }
  },
  computed: {
    urbitBindPath: function() {
      this.revisionMap = {}
      this.revisions = []
      return articleHistoryPath(this.article)
    },
    contentRendered: function() {
      return render(this.selected.content)
    },
  },
  methods: {
    urbitAccept: function(err, dat) {
      if (dat.data.ok || dat.data.article != this.article) {
        return
      }
      if (!this.revisionMap[dat.data.version]) {
        this.revisionMap[dat.data.version] = dat.data
        this.revisions.push(dat.data)
      }
    }
  }
}

Vue.component('nav-bar', {
  props: [ "article", "version", "editable", "history", "author", "at"],
  template: `
  <small>
    <router-link to="/">Home</router-link>
    <span v-if="article">
      | <router-link :to="{ name: 'all' }">All</router-link>
      <span v-if="history">
        | <router-link :to="{ name: 'view', params: {article: this.article} }">Latest</router-link>
      </span>
      <span v-else-if="!version || version != '0'">
        | <router-link :to="{ name: 'history', params: { article: this.article} }">History</router-link>
      </span>
    </span>
    <span v-if="editable">
      |
      <span v-if="$root.dukeOrBetter">
        <a @click.prevent="edit" href="#">Edit</a>
      </span>
      <span v-else>
        <span title="Duke rank (planet) or higher required to edit">Edit (?)</span>
      </span>
    </span>
    <span v-if="author">
      | Last edit by: {{ author }}
      (at: {{ at }})
    </span>
  </small>
  `,
  methods: {
    edit: function() {
      this.$router.push({ name: "edit", params: { article: this.article } })
    }
  }
})


const DEFAULT_TITLE = document.title

const routes = [
  { name: 'default', path: '/', redirect: '/view/MainPage' },
  { name: 'edit', path: '/edit/:article', component: Edit, props: true,
      meta: { title: "Edit {article}" } },
  { name: 'view', path: '/view/:article', component: View, props: true,
      meta: { title: "{article}" } },
  { name: 'history', path: '/history/:article', component: History, props: true,
      meta: { title: "History of {article}"} },
  { name: 'all', path: '/all', component: AllArticles,
      meta: { title: "All Articles"} },
]


const router = new VueRouter({
  routes // short for `routes: routes`
})

router.beforeEach((to, from, next) => {
  var title = ""
  if (to.meta.title) {
    title = to.meta.title
    for (param in to.params) {
      title = title.replace('{' + param + '}', to.params[param])
    }

    title += " | "
  }
  title += DEFAULT_TITLE
  document.title = title
  next()
})

var app = new Vue({
  router,
  data: function() {
    return {
      articles: [],
      articlesLoading: true,
    }
  },
  computed: {
    user: function() {
      return window.urb.user
    },
    dukeOrBetter: function() {
      return window.urb.user.length <= 13
    }
  },
  created: function() {
    bindPath("article/list", this.acceptList)
  },
  destroyed: function() {
    dropPath("article/list", this.acceptList)
  },
  methods: {
    acceptList: function(err, dat) {
      this.articles = Object.keys(dat.data)
      this.articlesLoading = false
    },
  }
}).$mount('#app')
