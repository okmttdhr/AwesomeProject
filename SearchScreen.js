/**
 * The examples provided by Facebook are for non-commercial testing and
 * evaluation purposes only.
 *
 * Facebook reserves all rights not expressly granted.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NON INFRINGEMENT. IN NO EVENT SHALL
 * FACEBOOK BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
 * AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * @flow
 */
'use strict';

var React = require('react-native');
var {
  ActivityIndicatorIOS, // ローディングのcomponent
  ListView,
  StyleSheet,
  Text,
  TextInput,
  View,
} = React;
var TimerMixin = require('react-timer-mixin');

var MovieCell = require('./MovieCell');
var MovieScreen = require('./MovieScreen');

/**
 * This is for demo purposes only, and rate limited.
 * In case you want to use the Rotten Tomatoes' API on a real app you should
 * create an account at http://developer.rottentomatoes.com/
 */
var API_URL = 'http://api.rottentomatoes.com/api/public/v1.0/';
var API_KEYS = [
  '7waqfqbprs7pajbz28mqf6vz',
  // 'y4vwv8m33hed9ety83jmv52f', Fallback api_key
];

// Results should be cached keyed by the query
// with values of null meaning "being fetched"
// and anything besides null and undefined
// as the result of a valid query
var resultsCache = {
  dataForQuery: {},
  nextPageNumberForQuery: {},
  totalForQuery: {},
};

var LOADING = {};

var SearchScreen = React.createClass({
  mixins: [TimerMixin],

  timeoutID: (null: any),

  getInitialState: function() {
    return {
      isLoading: false,
      isLoadingTail: false,
      dataSource: new ListView.DataSource({
        rowHasChanged: (row1, row2) => row1 !== row2,
      }),
      filter: '',
      queryNumber: 0,
    };
  },

  // 初回の描画が行われる直前に呼び出されます。
  // renderメソッドが呼び出される前にコンポーネントの状態を変更したい場合、これが最後の機会となります。
  componentDidMount: function() {
    this.searchMovies('');
  },

  _urlForQueryAndPage: function(query: string, pageNumber: ?number): string {
    var apiKey = API_KEYS[this.state.queryNumber % API_KEYS.length];
    if (query) {
      return (
        API_URL + 'movies.json?apikey=' + apiKey + '&q=' +
        encodeURIComponent(query) + '&page_limit=20&page=' + pageNumber
      );
    } else {
      // With no query, load latest movies
      return (
        API_URL + 'lists/movies/in_theaters.json?apikey=' + apiKey +
        '&page_limit=20&page=' + pageNumber
      );
    }
  },

  // 実際の検索メソッド
  searchMovies: function(query: string) {
    this.timeoutID = null;

    this.setState({filter: query});

    // cached されているデータが有る場合
    var cachedResultsForQuery = resultsCache.dataForQuery[query];
    if (cachedResultsForQuery) {
      if (!LOADING[query]) {
        this.setState({
          dataSource: this.getDataSource(cachedResultsForQuery),
          isLoading: false
        });
      } else {
        this.setState({isLoading: true});
      }
      return;
    }

    // cached されているデータがない場合
    LOADING[query] = true;
    resultsCache.dataForQuery[query] = null;
    this.setState({
      isLoading: true,
      queryNumber: this.state.queryNumber + 1,
      isLoadingTail: false,
    });

    // API通信
    fetch(this._urlForQueryAndPage(query, 1))
      .then((response) => response.json())
      .catch((error) => {
        // 失敗時
        LOADING[query] = false;
        resultsCache.dataForQuery[query] = undefined;

        this.setState({
          dataSource: this.getDataSource([]),
          isLoading: false,
        });
      })
      .then((responseData) => {
        // 成功時
        LOADING[query] = false;
        resultsCache.totalForQuery[query] = responseData.total;
        resultsCache.dataForQuery[query] = responseData.movies;
        resultsCache.nextPageNumberForQuery[query] = 2;

        if (this.state.filter !== query) {
          // do not update state if the query is stale
          return;
        }

        // dataSource の更新
        this.setState({
          isLoading: false,
          dataSource: this.getDataSource(responseData.movies),
        });
      })
      .done();
  },

  hasMore: function(): boolean {
    var query = this.state.filter;
    if (!resultsCache.dataForQuery[query]) {
      return true;
    }
    return (
      resultsCache.totalForQuery[query] !==
      resultsCache.dataForQuery[query].length
    );
  },

  onEndReached: function() {
    var query = this.state.filter;
    if (!this.hasMore() || this.state.isLoadingTail) {
      // We're already fetching or have all the elements so noop
      return;
    }

    if (LOADING[query]) {
      return;
    }

    LOADING[query] = true;
    this.setState({
      queryNumber: this.state.queryNumber + 1,
      isLoadingTail: true,
    });

    var page = resultsCache.nextPageNumberForQuery[query];
    fetch(this._urlForQueryAndPage(query, page))
      .then((response) => response.json())
      .catch((error) => {
        console.error(error);
        LOADING[query] = false;
        this.setState({
          isLoadingTail: false,
        });
      })
      .then((responseData) => {
        var moviesForQuery = resultsCache.dataForQuery[query].slice();

        LOADING[query] = false;
        // We reached the end of the list before the expected number of results
        if (!responseData.movies) {
          resultsCache.totalForQuery[query] = moviesForQuery.length;
        } else {
          for (var i in responseData.movies) {
            moviesForQuery.push(responseData.movies[i]);
          }
          resultsCache.dataForQuery[query] = moviesForQuery;
          resultsCache.nextPageNumberForQuery[query] += 1;
        }

        if (this.state.filter !== query) {
          // do not update state if the query is stale
          return;
        }

        this.setState({
          isLoadingTail: false,
          dataSource: this.getDataSource(resultsCache.dataForQuery[query]),
        });
      })
      .done();
  },

  getDataSource: function(movies: Array<any>): ListView.DataSource {
    return this.state.dataSource.cloneWithRows(movies);
  },

  // Movie 詳細ページへ
  selectMovie: function(movie: Object) {
    this.props.navigator.push({
      title: movie.title,
      component: MovieScreen,
      passProps: {movie},
    });
  },

  // 検索メソッド
  // 引数はevent
  // 例: console.log(event.nativeEvent); // {target: 7, text: "aaaaaaa"}
  onSearchChange: function(event: Object) {
    // テキストを取得、query として投げる
    var filter = event.nativeEvent.text.toLowerCase();

    this.clearTimeout(this.timeoutID);

    // 少し遅れらせて実行
    this.timeoutID = this.setTimeout(() => this.searchMovies(filter), 100);
  },

  renderFooter: function() {
    if (!this.hasMore() || !this.state.isLoadingTail) {
      return <View style={styles.scrollSpinner} />;
    }
    return <ActivityIndicatorIOS style={styles.scrollSpinner} />;
  },

  // 引数は、(rowData, sectionID, rowID) 。
  // rowData には、dataSource がはいっている
  // https://facebook.github.io/react-native/docs/listview.html#renderrow
  renderRow: function(movie: Object)  {
    return (
      <MovieCell
        onSelect={() => this.selectMovie(movie)}
        movie={movie}
      />
    );
  },

  render: function() {
    var content = this.state.dataSource.getRowCount() === 0 ?
      <NoMovies
        filter={this.state.filter}
        isLoading={this.state.isLoading}
      /> :
      <ListView
        ref="listview"
        dataSource={this.state.dataSource}
        // ListViewの関数。Footerを描画
        // https://facebook.github.io/react-native/docs/listview.html#renderfooter
        renderFooter={this.renderFooter}
        renderRow={this.renderRow}
        // Called when all rows have been rendered
        onEndReached={this.onEndReached}
        automaticallyAdjustContentInsets={false}
        // Determines whether the keyboard gets dismissed in response to a drag.
        // https://facebook.github.io/react-native/docs/scrollview.html#keyboarddismissmode
        keyboardDismissMode="onDrag"
        // keyboard 時に、input の外をタップした場合、keyboard を dismiss するかどうか。
        // false だと dismiss し、デフォルトイベントは発生しない。
        // true だと、dismiss せず、通常のタップイベントがあればそれが起こる。
        keyboardShouldPersistTaps={false}
        // スクロールバー
        showsVerticalScrollIndicator={false}
      />;

    return (
      <View style={styles.container}>
        <SearchBar
          onSearchChange={this.onSearchChange}
          isLoading={this.state.isLoading}
          onFocus={() => this.refs.listview.getScrollResponder().scrollTo(0, 0)}
        />
        <View style={styles.separator} />
        {content}
      </View>
    );
  },
});

var NoMovies = React.createClass({
  render: function() {
    var text = '';
    // React.jsのProp - Qiita
    // http://qiita.com/koba04/items/bc13d1f42964278ae14e
    if (this.props.filter) {
      text = `No results for “${this.props.filter}”`;
    } else if (!this.props.isLoading) {
      // If we're looking at the latest movies, aren't currently loading, and
      // still have no results, show a message
      text = 'No movies found';
    }

    return (
      <View style={[styles.container, styles.centerText]}>
        <Text style={styles.noMoviesText}>{text}</Text>
      </View>
    );
  }
});

var SearchBar = React.createClass({
  render: function() {
    return (
      <View style={styles.searchBar}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          // 変更時のメソッド。<SearchBar onSearchChange="" />を参照
          onChange={this.props.onSearchChange}
          placeholder="Search a movie..."
          // <SearchBar onFocus="" />を参照
          onFocus={this.props.onFocus}
          style={styles.searchBarInput}
        />
        <ActivityIndicatorIOS
          animating={this.props.isLoading}
          style={styles.spinner}
        />
      </View>
    );
  }
});

// Flexbox について。↓
// これからのCSSレイアウトはFlexboxで決まり！ | Webクリエイターボックス
// http://www.webcreatorbox.com/tech/flexbox/
var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  centerText: {
    alignItems: 'center',
  },
  noMoviesText: {
    marginTop: 80,
    color: '#888888',
  },
  searchBar: {
    marginTop: 64,
    padding: 3,
    paddingLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBarInput: {
    fontSize: 15,
    flex: 1,
    height: 30,
  },
  separator: {
    height: 1,
    backgroundColor: '#eeeeee',
  },
  spinner: {
    width: 30,
  },
  scrollSpinner: {
    marginVertical: 20,
  },
});

module.exports = SearchScreen;
