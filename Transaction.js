import React, { Component } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ImageBackground,
  Image,
  Alert,
  ToastAndroid,
  KeyboardAvoidingView
} from "react-native";
import * as Permissions from "expo-permissions";
import { BarCodeScanner } from "expo-barcode-scanner";
import db from "../config";
import firebase from "firebase";

const bgImage = require("../assets/background2.png");
const appIcon = require("../assets/appIcon.png");
const appName = require("../assets/appName.png");

export default class TransactionScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      bookId: "",
      studentId: "",
      domState: "normal",
      hasCameraPermissions: null,
      scanned: false,
      bookName: "",
      studentName: ""
    };
  }

  getCameraPermissions = async domState => {
    const { status } = await Permissions.askAsync(Permissions.CAMERA);

    this.setState({
      /*status === "granted" é verdadeiro se o usuário concedeu permissão
          status === "granted" é falso se o usuário não concedeu permissão
        */
      hasCameraPermissions: status === "granted",
      domState: domState,
      scanned: false
    });
  };

  handleBarCodeScanned = async ({ type, data }) => {
    const { domState } = this.state;

    if (domState === "bookId") {
      this.setState({
        bookId: data,
        domState: "normal",
        scanned: true
      });
    } else if (domState === "studentId") {
      this.setState({
        studentId: data,
        domState: "normal",
        scanned: true
      });
    }
  };

  //bp
  handleTransaction = async () => {
    var { bookId, studentId } = this.state;
    await this.getBookDetails(bookId);
    await this.getStudentDetails(studentId);

    var transactionType = await this.checkBookAvailability(bookId);

    if (!transactionType) {
      this.setState({ bookId: "", studentId: "" });
      // Apenas para usuários do Android
      // ToastAndroid.show("O livro não existe no banco de dados da biblioteca!", ToastAndroid.SHORT);
      Alert.alert("O livro não existe no banco de dados da biblioteca!");
    } else if (transactionType === "issue") {
      var isEligible = await this.checkStudentEligibilityForBookIssue(
        studentId
      );

      if (isEligible) {
        var { bookName, studentName } = this.state;
        this.initiateBookIssue(bookId, studentId, bookName, studentName);
      }
      // For Android users only
      // ToastAndroid.show("Livro devolvido à biblioteca!", ToastAndroid.SHORT);
      Alert.alert("Livro devolvido à biblioteca!");
    } else {
      var isEligible = await this.checkStudentEligibilityForBookReturn(
        bookId,
        studentId
      );

      if (isEligible) {
        var { bookName, studentName } = this.state;
        this.initiateBookReturn(bookId, studentId, bookName, studentName);
      }
      // For Android users only
      // ToastAndroid.show("Livro devolvido à biblioteca!", ToastAndroid.SHORT);
      Alert.alert("Livro devolvido à biblioteca!");
    }
  };

  getBookDetails = bookId => {
    bookId = bookId.trim();
    db.collection("BOOK")
      .where("bookId", "==", bookId)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            bookName: doc.data().book_details.book_name
          });
        });
      });
  };

  getStudentDetails = studentId => {
    studentId = studentId.trim();
    db.collection("STUDENT")
      .where("studentId", "==", studentId)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            studentName: doc.data().student_details.student_name
          });
        });
      });
  };

  //T
  checkBookAvailability = async bookId => {
    const bookRef = await db
      .collection("BOOK")
      .where("bookId", "==", bookId)
      .get();

    var transactionType = "";
    if (bookRef.docs.length == 0) {
      transactionType = false;
    } else {
      bookRef.docs.map(doc => {
        //se o livro estiver disponível, o tipo de transação será issue (entregar)
        // caso contrário, será return (devolver)
        transactionType = doc.data().isBookAvailable ? "issue" : "return";
      });
    }

    return transactionType;
  };

  

  //Bp
  checkStudentEligibilityForBookReturn = async (bookId, studentId) => {
    const transactionRef = await db
      .collection("TRANSACTION")
      .where("bookId", "==", bookId)
      .limit(1)
      .get();
    var isStudentEligible = "";
    transactionRef.docs.map(doc => {
      var lastBookTransaction = doc.data();
      if (lastBookTransaction.studentId === studentId) {
        isStudentEligible = true;
      } else {
        isStudentEligible = false;
        Alert.alert("O livro não foi retirado por este aluno!");
        this.setState({
          bookId: "",
          studentId: ""
        });
      }
    });
    return isStudentEligible;
  };

  checkStudentEligibilityForBookIssue = async studentId => {
    const studentRef = await db 
      .collection("STUDENT")
      .where("studentId", "==", studentId)
      .get();

      var isStudentEligible = "";
      if (studentRef.docs.length == 0){
        this.setState({
          bookId: "",
          studentId: ""
        });
        isStudentEligible = false;
        Alert.alert("O id do aluno não consta no banco de dados!");


      }
      else {
        studentRef.docs.map(doc => {
          if (doc.data().numberOfBookIssued < 2){
            isStudentEligible = true;
          }
          else {
            isStudentEligible = false;
            Alert.alert("O estudante já retirou 2 livros!");
            this.setState({
              bookId: "",
              studentId: ""
            });
          }
        });
      }
      
      
  }

  

  initiateBookIssue = async (bookId, studentId, bookName, studentName) => {
    // adicionar uma transação
    db.collection("TRANSACTION").add({
      studentId: studentId,
      studentName: studentName,
      bookId: bookId,
      bookName: bookName,
      date: firebase.firestore.Timestamp.now().toDate(),
      transactionType: "issue"
    });
    // alterar status do livro
    db.collection("BOOK")
      .doc(bookId)
      .update({
        isBookAvailable: false
      });
    // alterar o número de livros retirados pelo aluno
    db.collection("STUDENT")
      .doc(studentId)
      .update({
        numberOfBookIssued: firebase.firestore.FieldValue.increment(1)
      });

    // atualizando estado local
    this.setState({
      bookId: "",
      studentId: ""
    });
  };

  initiateBookReturn = async (bookId, studentId, bookName, studentName) => {
    // adicionar uma transação
    db.collection("TRANSACTION").add({
      studentId: studentId,
      studentName: studentName,
      bookId: bookId,
      bookName: bookName,
      date: firebase.firestore.Timestamp.now().toDate(),
      transactionType: "return"
    });
    // alterar status do livro
    db.collection("BOOK")
      .doc(bookId)
      .update({
        isBookAvailable: true
      });
    // alterar o número de livros retirados pelo aluno
    db.collection("STUDENT")
      .doc(studentId)
      .update({
        numberOfBookIssued: firebase.firestore.FieldValue.increment(-1)
      });

    // Atualizando estado local
    this.setState({
      bookId: "",
      studentId: ""
    });
  };

  render() {
    const { bookId, studentId, domState, scanned } = this.state;
    if (domState !== "normal") {
      return (
        <BarCodeScanner
          onBarCodeScanned={scanned ? undefined : this.handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
      );
    }
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <ImageBackground source={bgImage} style={styles.bgImage}>
          <View style={styles.upperContainer}>
            <Image source={appIcon} style={styles.appIcon} />
            <Image source={appName} style={styles.appName} />
          </View>
          <View style={styles.lowerContainer}>
            <View style={styles.textinputContainer}>
              <TextInput
                style={styles.textinput}
                placeholder={"ID do Livro"}
                placeholderTextColor={"#FFFFFF"}
                value={bookId}
                onChangeText={text => this.setState({ bookId: text })}
              />
              <TouchableOpacity
                style={styles.scanbutton}
                onPress={() => this.getCameraPermissions("bookId")}
              >
                <Text style={styles.scanbuttonText}>Digitalizar</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.textinputContainer, { marginTop: 25 }]}>
              <TextInput
                style={styles.textinput}
                placeholder={"ID do Aluno"}
                placeholderTextColor={"#FFFFFF"}
                value={studentId}
                onChangeText={text => this.setState({ studentId: text })}
              />
              <TouchableOpacity
                style={styles.scanbutton}
                onPress={() => this.getCameraPermissions("studentId")}
              >
                <Text style={styles.scanbuttonText}>Digitalizar</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.button, { marginTop: 25 }]}
              onPress={this.handleTransaction}
            >
              <Text style={styles.buttonText}>Enviar</Text>
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </KeyboardAvoidingView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF"
  },
  bgImage: {
    flex: 1,
    resizeMode: "cover",
    justifyContent: "center"
  },
  upperContainer: {
    flex: 0.5,
    justifyContent: "center",
    alignItems: "center"
  },
  appIcon: {
    width: 200,
    height: 200,
    resizeMode: "contain",
    marginTop: 80
  },
  appName: {
    width: 180,
    resizeMode: "contain"
  },
  lowerContainer: {
    flex: 0.5,
    alignItems: "center"
  },
  textinputContainer: {
    borderWidth: 2,
    borderRadius: 10,
    flexDirection: "row",
    backgroundColor: "#9DFD24",
    borderColor: "#FFFFFF"
  },
  textinput: {
    width: "57%",
    height: 50,
    padding: 10,
    borderColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 3,
    fontSize: 18,
    backgroundColor: "#5653D4",
    fontFamily: "Rajdhani_600SemiBold",
    color: "#FFFFFF"
  },
  scanbutton: {
    width: 100,
    height: 50,
    backgroundColor: "#9DFD24",
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: "center",
    alignItems: "center"
  },
  scanbuttonText: {
    fontSize: 20,
    color: "#0A0101",
    fontFamily: "Rajdhani_600SemiBold"
  },
  button: {
    width: "43%",
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F48D20",
    borderRadius: 15
  },
  buttonText: {
    fontSize: 24,
    color: "#FFFFFF",
    fontFamily: "Rajdhani_600SemiBold"
  }
});
